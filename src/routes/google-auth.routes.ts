import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { env } from "../config/env";
import { issueAccessToken } from "../services/auth";

export const googleAuthRouter = Router();

function frontendRedirect(params: Record<string, string>) {
  const url = new URL("/", env.FRONTEND_URL);
  const query = new URLSearchParams(params);
  url.hash = `/login?${query.toString()}`;
  return url.toString();
}

function oauthSecret(): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET is not configured");
  return env.JWT_SECRET;
}

googleAuthRouter.get("/", (_req, res) => {
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

googleAuthRouter.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const cookieHeader = req.header("cookie") || "";
  const cookieState = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("korobo_google_state="))?.slice("korobo_google_state=".length);
  res.setHeader("Set-Cookie", `korobo_google_state=; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=0${env.NODE_ENV === "production" ? "; Secure" : ""}`);
  if (!code || !state || !cookieState || decodeURIComponent(cookieState) !== state || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
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
    const googleProfile = await profileResponse.json() as { email?: string; verified_email?: boolean; name?: string };
    const email = googleProfile.email?.trim().toLowerCase();
    if (!email || googleProfile.verified_email !== true) {
      res.redirect(frontendRedirect({ google_error: "google_email_unverified" }));
      return;
    }

    if (!AppDataSource.isInitialized) throw new Error("Database unavailable");
    const repository = AppDataSource.getRepository(AppUser);
    let user = await repository
      .createQueryBuilder("user")
      .where("LOWER(user.email) = LOWER(:email)", { email })
      .getOne();

    const flow = typeof claims === "object" && claims !== null && "flow" in claims && claims.flow === "register"
      ? "register"
      : "login";

    // Existing accounts keep their Neon-owned roles. Public Google signup can never grant admin.
    if (!user && flow === "register") {
      const fullName = googleProfile.name?.trim().slice(0, 160) || email.split("@")[0].slice(0, 160);
      try {
        user = repository.create({
          id: randomUUID(),
          fullName,
          email,
          passwordHash: null,
          role: "technician",
          phone: null,
          isActive: true
        });
        user = await repository.save(user);
      } catch (creationError) {
        // If two signup callbacks race, reuse the account created by the other request.
        user = await repository.createQueryBuilder("user")
          .where("LOWER(user.email) = LOWER(:email)", { email })
          .getOne();
        if (!user) throw creationError;
      }
    }

    if (!user || !user.isActive) {
      res.redirect(frontendRedirect({ google_error: "google_account_not_allowed" }));
      return;
    }

    const accessToken = issueAccessToken({ id: user.id, email: user.email });
    res.redirect(frontendRedirect({ google_token: accessToken }));
  } catch (error) {
    console.error("Google OAuth callback failed:", error instanceof Error ? error.message : "unknown error");
    res.redirect(frontendRedirect({ google_error: "google_auth_failed" }));
  }
});
