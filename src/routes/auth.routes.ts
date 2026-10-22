import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { AppUser, type AppUserRole } from "../entities/AppUser";
import { env } from "../config/env";
import { authenticate, requireAdmin } from "../middleware/authenticate";
import { createOneTimeToken, hashToken, issueAccessToken, verifyAccessToken } from "../services/auth";
import { sendAccountEmail } from "../services/email";

export const authRouter = Router();
const ownerSchema = z.object({ fullName: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254), password: z.string().min(12).max(128), phone: z.string().trim().max(40).optional() });
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
const inviteSchema = z.object({ fullName: z.string().trim().min(2).max(160), email: z.string().trim().email().max(254), phone: z.string().trim().max(40).optional(), role: z.enum(["manager", "technician", "viewer"]) });
const resetRequestSchema = z.object({ email: z.string().trim().email().max(254) });
const tokenPasswordSchema = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) });
function tokenMatches(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function profilePayload(profile: AppUser) {
  return { id: profile.id, fullName: profile.fullName, email: profile.email, role: profile.role, phone: profile.phone, isActive: profile.isActive };
}
async function issueSession(profile: AppUser, req: import("express").Request) {
  const accessToken = issueAccessToken({ id: profile.id, email: profile.email });
  const claims = verifyAccessToken(accessToken);
  if (claims.jti && claims.exp) {
    await AppDataSource.query(
      "INSERT INTO public.auth_sessions (user_id, token_id, expires_at, user_agent, ip_address) VALUES ($1, $2, to_timestamp($3), $4, $5)",
      [profile.id, claims.jti, claims.exp, req.get("user-agent") || null, req.ip || null]
    );
  }
  return { data: profilePayload(profile), accessToken, tokenType: "Bearer", expiresIn: env.JWT_EXPIRES_IN };
}
async function createOneTimeAction(userId: string, purpose: "invite" | "password_reset", ttlHours: number) {
  const token = createOneTimeToken();
  await AppDataSource.query(`INSERT INTO public.auth_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, now() + ($4 * interval '1 hour'))`, [userId, hashToken(token), purpose, ttlHours]);
  return token;
}
authRouter.post("/bootstrap-owner", async (req, res, next) => {
  if (!tokenMatches(req.header("x-owner-bootstrap-token"), env.OWNER_BOOTSTRAP_TOKEN)) { res.status(403).json({ error: { code: "BOOTSTRAP_TOKEN_INVALID", message: "Owner setup is not authorized." } }); return; }
  const parsed = ownerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Enter a valid name, email, and password (at least 12 characters)." } }); return; }
  if (!AppDataSource.isInitialized) { res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is not ready." } }); return; }
  const runner = AppDataSource.createQueryRunner();
  try {
    await runner.connect(); await runner.startTransaction(); await runner.query("SELECT pg_advisory_xact_lock($1)", [731904218]);
    if (await runner.manager.count(AppUser) > 0) { await runner.rollbackTransaction(); res.status(409).json({ error: { code: "OWNER_ALREADY_CONFIGURED", message: "The initial owner has already been created." } }); return; }
    const input = parsed.data;
    const profile = runner.manager.create(AppUser, { id: randomUUID(), fullName: input.fullName, email: input.email.toLowerCase(), passwordHash: await bcrypt.hash(input.password, 12), role: "admin" satisfies AppUserRole, phone: input.phone || null, isActive: true });
    await runner.manager.save(AppUser, profile); await runner.commitTransaction();
    res.status(201).json({ ...await issueSession(profile, req), message: "Owner account created. Remove OWNER_BOOTSTRAP_TOKEN from the API environment now." });
  } catch (error) { if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined); next(error); }
  finally { await runner.release(); }
});
authRouter.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Enter a valid email and password." } }); return; }
  try {
    if (!AppDataSource.isInitialized) throw new Error("Database is unavailable");
    const profile = await AppDataSource.getRepository(AppUser).createQueryBuilder("user").addSelect("user.passwordHash").where("LOWER(user.email) = LOWER(:email)", { email: parsed.data.email }).getOne();
    if (!profile || !profile.isActive || !profile.passwordHash || !(await bcrypt.compare(parsed.data.password, profile.passwordHash))) { res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Adresse e-mail ou mot de passe incorrect." } }); return; }
    res.status(200).json(await issueSession(profile, req));
  } catch (error) { next(error); }
});
authRouter.post("/logout", authenticate, async (req, res, next) => {
  try {
    const token = req.header("authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];
    if (token) {
      const claims = verifyAccessToken(token);
      if (claims.jti) await AppDataSource.query(
        "UPDATE public.auth_sessions SET revoked_at = now() WHERE token_id = $1 AND user_id = $2 AND revoked_at IS NULL",
        [claims.jti, req.authProfile!.id]
      );
    }
    res.status(204).end();
  } catch (error) { next(error); }
});
authRouter.get("/me", authenticate, (req, res) => { res.status(200).json({ data: profilePayload(req.authProfile!) }); });
authRouter.post("/invite", authenticate, requireAdmin, async (req, res, next) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Enter a valid name, email, and allowed role." } }); return; }
  try {
    const email = parsed.data.email.toLowerCase(), repository = AppDataSource.getRepository(AppUser);
    if (await repository.findOne({ where: { email } })) { res.status(409).json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "A user with this email already exists." } }); return; }
    const profile = repository.create({ id: randomUUID(), fullName: parsed.data.fullName, email, role: parsed.data.role, phone: parsed.data.phone || null, isActive: false, passwordHash: null });
    await repository.save(profile);
    try {
      const token = await createOneTimeAction(profile.id, "invite", 72);
      const link = new URL("/#/reset-password", env.FRONTEND_URL); link.searchParams.set("token", token);
      await sendAccountEmail(email, "Invitation à rejoindre KOROBO", "Votre compte KOROBO vous attend", "Choisissez un mot de passe pour activer votre compte. Ce lien expire dans 72 heures.", link.toString());
    } catch (emailError) { await repository.delete({ id: profile.id }); throw emailError; }
    res.status(201).json({ data: profilePayload(profile), message: "Invitation sent." });
  } catch (error) { next(error); }
});
authRouter.post("/password/forgot", async (req, res, next) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(200).json({ message: "If the account exists, reset instructions will be sent." }); return; }
  try {
    const profile = await AppDataSource.getRepository(AppUser).findOne({ where: { email: parsed.data.email.toLowerCase(), isActive: true } });
    if (profile) {
      await AppDataSource.query("UPDATE public.auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL", [profile.id]);
      const token = await createOneTimeAction(profile.id, "password_reset", 1);
      const link = new URL("/#/reset-password", env.FRONTEND_URL); link.searchParams.set("token", token);
      await sendAccountEmail(profile.email, "Réinitialisation du mot de passe KOROBO", "Réinitialisez votre mot de passe", "Ce lien est valable pendant une heure.", link.toString());
    }
    res.status(200).json({ message: "If the account exists, reset instructions will be sent." });
  } catch (error) { next(error); }
});
authRouter.post("/password/reset", async (req, res, next) => {
  const parsed = tokenPasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid token or password. Use at least 12 characters." } }); return; }
  try {
    const rows = await AppDataSource.query("SELECT id, user_id, purpose FROM public.auth_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1", [hashToken(parsed.data.token)]) as Array<{ id: string; user_id: string; purpose: "invite" | "password_reset" }>;
    const record = rows[0];
    if (!record) { res.status(400).json({ error: { code: "TOKEN_INVALID", message: "This link is invalid or has expired. Request a new one." } }); return; }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await AppDataSource.transaction(async manager => {
      await manager.query("UPDATE public.app_users SET password_hash = $1, is_active = true, updated_at = now() WHERE id = $2", [passwordHash, record.user_id]);
      await manager.query("UPDATE public.auth_tokens SET used_at = now() WHERE id = $1 OR (user_id = $2 AND purpose = $3 AND used_at IS NULL)", [record.id, record.user_id, record.purpose]);
      await manager.query("UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [record.user_id]);
    });
    res.status(200).json({ message: "Password updated. You can now sign in." });
  } catch (error) { next(error); }
});
authRouter.post("/password/change", authenticate, async (req, res, next) => {
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(128) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Enter your current password and a new password of at least 12 characters." } }); return; }
  try {
    const user = await AppDataSource.getRepository(AppUser).createQueryBuilder("user").addSelect("user.passwordHash").where("user.id = :id", { id: req.authProfile!.id }).getOne();
    if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) { res.status(400).json({ error: { code: "CURRENT_PASSWORD_INVALID", message: "The current password is incorrect." } }); return; }
    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12); await AppDataSource.getRepository(AppUser).save(user);
    const token = req.header("authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];
    const claims = token ? verifyAccessToken(token) : null;
    await AppDataSource.query("UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND token_id <> $2", [user.id, claims?.jti || ""]);
    res.status(200).json({ message: "Password changed. Other sessions have been signed out." });
  } catch (error) { next(error); }
});
