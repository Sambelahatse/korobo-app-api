import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { authenticate } from "../middleware/authenticate";
import { hashToken, verifyAccessToken } from "../services/auth";

export const accountRouter = Router();
accountRouter.use(authenticate);

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).nullable().optional()
});
const preferencesSchema = z.object({
  language: z.enum(["Français", "English", "Malagasy"]).default("Français"),
  theme: z.enum(["Clair", "Sombre", "Système"]).default("Clair"),
  notifications: z.object({
    email: z.boolean(), push: z.boolean(), outageAlerts: z.boolean(),
    maintenanceReminders: z.boolean(), monthlyReports: z.boolean()
  }),
  security: z.object({ twoFactor: z.boolean(), sessionTimeout: z.boolean() })
});
function currentTokenId(req: import("express").Request): string | null {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try { return verifyAccessToken(token).jti ?? null; } catch { return null; }
}
function accountError(res: import("express").Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

accountRouter.get("/", async (req, res, next) => {
  try {
    const user = await AppDataSource.getRepository(AppUser).findOne({ where: { id: req.authProfile!.id } });
    if (!user) { accountError(res, 404, "ACCOUNT_NOT_FOUND", "Compte introuvable."); return; }
    const preferences = await AppDataSource.query(
      "SELECT preferences FROM public.account_preferences WHERE user_id = $1 LIMIT 1", [user.id]
    ) as Array<{ preferences: unknown }>;
    res.json({ data: {
      profile: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive },
      googleLinked: Boolean(user.googleSub),
      preferences: preferences[0]?.preferences ?? null
    }});
  } catch (error) { next(error); }
});

accountRouter.patch("/profile", async (req, res, next) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) { accountError(res, 400, "VALIDATION_ERROR", "Vérifiez le nom et le numéro de téléphone."); return; }
  try {
    const repository = AppDataSource.getRepository(AppUser);
    const user = await repository.findOne({ where: { id: req.authProfile!.id } });
    if (!user) { accountError(res, 404, "ACCOUNT_NOT_FOUND", "Compte introuvable."); return; }
    user.fullName = parsed.data.fullName;
    user.phone = parsed.data.phone?.trim() || null;
    await repository.save(user);
    res.json({ data: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive } });
  } catch (error) { next(error); }
});

accountRouter.get("/preferences", async (req, res, next) => {
  try {
    const rows = await AppDataSource.query("SELECT preferences FROM public.account_preferences WHERE user_id = $1 LIMIT 1", [req.authProfile!.id]) as Array<{ preferences: unknown }>;
    res.json({ data: rows[0]?.preferences ?? null });
  } catch (error) { next(error); }
});

accountRouter.put("/preferences", async (req, res, next) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) { accountError(res, 400, "VALIDATION_ERROR", "Les préférences fournies sont invalides."); return; }
  try {
    const rows = await AppDataSource.query(
      `INSERT INTO public.account_preferences (user_id, preferences, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = now()
       RETURNING preferences`,
      [req.authProfile!.id, JSON.stringify(parsed.data)]
    ) as Array<{ preferences: unknown }>;
    res.json({ data: rows[0]?.preferences ?? parsed.data });
  } catch (error) { next(error); }
});

accountRouter.get("/sessions", async (req, res, next) => {
  try {
    const currentId = currentTokenId(req);
    const rows = await AppDataSource.query(
      `SELECT id, created_at, last_seen_at, expires_at, user_agent, ip_address, token_id
       FROM public.auth_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 25`,
      [req.authProfile!.id]
    ) as Array<{ id: string; created_at: Date; last_seen_at: Date | null; expires_at: Date; user_agent: string | null; ip_address: string | null; token_id: string }>;
    res.json({ data: rows.map(row => ({
      id: row.id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at,
      userAgent: row.user_agent, ipAddress: row.ip_address, current: Boolean(currentId && row.token_id === currentId)
    })) });
  } catch (error) { next(error); }
});

accountRouter.delete("/sessions/:id", async (req, res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) { accountError(res, 400, "SESSION_ID_INVALID", "Identifiant de session invalide."); return; }
  try {
    const result = await AppDataSource.query(
      "UPDATE public.auth_sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id",
      [req.params.id, req.authProfile!.id]
    ) as Array<{ id: string }>;
    if (!result.length) { accountError(res, 404, "SESSION_NOT_FOUND", "Session introuvable ou déjà révoquée."); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

accountRouter.post("/google/unlink", async (req, res, next) => {
  try {
    const repository = AppDataSource.getRepository(AppUser);
    const user = await repository.createQueryBuilder("user").addSelect("user.passwordHash").where("user.id = :id", { id: req.authProfile!.id }).getOne();
    if (!user?.googleSub) { accountError(res, 409, "GOOGLE_NOT_LINKED", "Aucun compte Google n’est associé."); return; }
    if (!user.passwordHash) { accountError(res, 409, "PASSWORD_REQUIRED", "Définissez d’abord un mot de passe avant de dissocier Google."); return; }
    user.googleSub = null;
    await repository.save(user);
    res.json({ message: "Compte Google dissocié." });
  } catch (error) { next(error); }
});

accountRouter.delete("/", async (req, res, next) => {
  const parsed = z.object({ email: z.string().trim().email().max(254), currentPassword: z.string().max(128).optional() }).safeParse(req.body);
  if (!parsed.success || parsed.data.email.toLowerCase() !== req.authProfile!.email.toLowerCase()) {
    accountError(res, 400, "ACCOUNT_CONFIRMATION_INVALID", "Saisissez l’adresse e-mail exacte du compte pour confirmer.");
    return;
  }
  try {
    const repository = AppDataSource.getRepository(AppUser);
    const user = await repository.createQueryBuilder("user").addSelect("user.passwordHash").where("user.id = :id", { id: req.authProfile!.id }).getOne();
    if (!user) { accountError(res, 404, "ACCOUNT_NOT_FOUND", "Compte introuvable."); return; }
    if (user.passwordHash && (!parsed.data.currentPassword || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)))) {
      accountError(res, 400, "CURRENT_PASSWORD_INVALID", "Le mot de passe actuel est incorrect.");
      return;
    }
    await AppDataSource.transaction(async manager => {
      await manager.query("UPDATE public.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
      await manager.query("UPDATE public.auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
      await manager.query(
        "UPDATE public.app_users SET is_active = false, email = $1, full_name = 'Compte supprimé', phone = NULL, password_hash = NULL, google_sub = NULL, updated_at = now() WHERE id = $2",
        [`deleted+${user.id}@accounts.korobo.invalid`, user.id]
      );
      await manager.query("DELETE FROM public.account_preferences WHERE user_id = $1", [user.id]);
    });
    res.status(204).end();
  } catch (error) { next(error); }
});
