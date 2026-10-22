import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { env } from "../config/env";
import { issueAccessToken, verifyAccessToken } from "../services/auth";
import { authenticate } from "../middleware/authenticate";

export const googleAuthRouter = Router();

function frontendRedirect(params: Record<string, string>, page = "login") {
  const url = new URL("/", env.FRONTEND_URL);
  const query = new URLSearchParams(params);
  url.hash = `/${page}?${query.toString()}`;
  return url.toString();
}

function oauthSecret(): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET is not configured");
  return env.JWT_SECRET;
}

googleAuthRouter.get("/", (req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    res.redirect(frontendRedirect({ google_error: "google_not_configured" }));
    return;
  }
  const requestedFlow = req.query.flow === "register" ? "register" : "login";
  const state = jwt.sign(
    { purpose: "google_oauth", flow: requestedFlow, nonce: randomBytes(24).toString("base64url") },
    oauthSecret(),
    { expiresIn: "10m", issuer: "korobo-app-api", audience: "korobo-google-oauth" }
  );
  res.setHeader("Set-Cookie", `korobo_google_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=600${env.NODE_ENV === "production" ? "; Secure" : ""}`);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

googleAuthRouter.post("/link-url", authenticate, (req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    res.status(503).json({ error: { code: "GOOGLE_NOT_CONFIGURED", message: "La connexion Google n’est pas configurée." } });
    return;
  }
  const state = jwt.sign(
    { purpose: "google_oauth", flow: "link", userId: req.authProfile!.id, nonce: randomBytes(24).toString("base64url") },
    oauthSecret(),
    { expiresIn: "10m", issuer: "korobo-app-api", audience: "korobo-google-oauth" }
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.json({ url: url.toString() });
});

googleAuthRouter.get("/link", authenticate, (req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    res.redirect(frontendRedirect({ google_error: "google_not_configured" }, "settings"));
    return;
  }
  const state = jwt.sign(
    { purpose: "google_oauth", flow: "link", userId: req.authProfile!.id, nonce: randomBytes(24).toString("base64url") },
    oauthSecret(),
    { expiresIn: "10m", issuer: "korobo-app-api", audience: "korobo-google-oauth" }
  );
  res.setHeader("Set-Cookie", `korobo_google_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=600${env.NODE_ENV === "production" ? "; Secure" : ""}`);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

googleAuthRouter.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const cookieHeader = req.header("cookie") || "";
  const cookieState = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("korobo_google_state="))?.slice("korobo_google_state=".length);
  res.setHeader("Set-Cookie", `korobo_google_state=; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=0${env.NODE_ENV === "production" ? "; Secure" : ""}`);
  if (!code || !state || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    res.redirect(frontendRedirect({ google_error: "google_callback_invalid" }));
    return;
  }

  try {
    const claims = jwt.verify(state, oauthSecret(), {
      issuer: "korobo-app-api",
      audience: "korobo-google-oauth"
    });
    if (typeof claims === "string" || claims.purpose !== "google_oauth" || !claims.nonce) {
      res.redirect(frontendRedirect({ google_error: "google_state_invalid" }));
      return;
    }

    const isLinkFlow = typeof claims === "object" && claims !== null && "flow" in claims && claims.flow === "link";
    if (!isLinkFlow && (!cookieState || decodeURIComponent(cookieState) !== state)) {
      res.redirect(frontendRedirect({ google_error: "google_callback_invalid" }));
      return;
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokens = await tokenResponse.json() as { access_token?: string; token_type?: string };
    if (!tokens.access_token) throw new Error("Google access token missing");

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!profileResponse.ok) throw new Error("Google profile lookup failed");
    const googleProfile = await profileResponse.json() as { id?: string; email?: string; verified_email?: boolean; name?: string };
    const email = googleProfile.email?.trim().toLowerCase();
    if (!email || !googleProfile.id || googleProfile.verified_email !== true) {
      res.redirect(frontendRedirect({ google_error: "google_email_unverified" }));
      return;
    }

    if (!AppDataSource.isInitialized) throw new Error("Database unavailable");
    const repository = AppDataSource.getRepository(AppUser);
    let user = await repository
      .createQueryBuilder("user")
      .where("LOWER(user.email) = LOWER(:email)", { email })
      .getOne();

    const flow = typeof claims === "object" && claims !== null && "flow" in claims && typeof claims.flow === "string"
      ? claims.flow
      : "login";

    if (flow === "link") {
      const userId = typeof claims === "object" && claims !== null && "userId" in claims && typeof claims.userId === "string" ? claims.userId : "";
      const linkingUser = userId ? await repository.createQueryBuilder("user").addSelect("user.passwordHash").where("user.id = :userId", { userId }).getOne() : null;
      const alreadyLinked = await repository.createQueryBuilder("user").where("user.googleSub = :googleSub", { googleSub: googleProfile.id }).getOne();
      if (!linkingUser || !linkingUser.isActive || (alreadyLinked && alreadyLinked.id !== linkingUser.id)) {
        res.redirect(frontendRedirect({ google_error: "google_link_not_allowed" }, "settings"));
        return;
      }
      linkingUser.googleSub = googleProfile.id;
      await repository.save(linkingUser);
      res.redirect(frontendRedirect({ google_linked: "1" }, "settings"));
      return;
    }

    // Existing accounts keep their Neon-owned roles. Public Google signup can never grant admin.
    if (!user && flow === "register") {
      const fullName = googleProfile.name?.trim().slice(0, 160) || (email.split("@")[0] || "KOROBO user").slice(0, 160);
      try {
        user = repository.create({
          id: randomUUID(),
          fullName,
          email,
          passwordHash: null,
          googleSub: googleProfile.id,
          role: "technician",
          phone: null,
          isActive: true
        });
        user = await repository.save(user);
      } catch (creationError) {
        user = await repository.createQueryBuilder("user")
          .where("LOWER(user.email) = LOWER(:email)", { email })
          .getOne();
        if (!user) throw creationError;
      }
    }

    if (!user || !user.isActive || (user.googleSub && user.googleSub !== googleProfile.id)) {
      res.redirect(frontendRedirect({ google_error: "google_account_not_allowed" }));
      return;
    }
    if (!user.googleSub) {
      const duplicateGoogle = await repository.createQueryBuilder("user").where("user.googleSub = :googleSub", { googleSub: googleProfile.id }).getOne();
      if (duplicateGoogle && duplicateGoogle.id !== user.id) {
        res.redirect(frontendRedirect({ google_error: "google_account_not_allowed" }));
        return;
      }
      user.googleSub = googleProfile.id;
      await repository.save(user);
    }

    const accessToken = issueAccessToken({ id: user.id, email: user.email });
    const accessClaims = verifyAccessToken(accessToken);
    if (accessClaims.jti && accessClaims.exp) {
      await AppDataSource.query(
        "INSERT INTO public.auth_sessions (user_id, token_id, expires_at, user_agent, ip_address) VALUES ($1, $2, to_timestamp($3), $4, $5)",
        [user.id, accessClaims.jti, accessClaims.exp, req.get("user-agent") || null, req.ip || null]
      );
    }
    res.redirect(frontendRedirect({ google_token: accessToken }));
  } catch (error) {
    console.error("Google OAuth callback failed:", error instanceof Error ? error.message : "unknown error");
    res.redirect(frontendRedirect({ google_error: "google_auth_failed" }));
  }
});
