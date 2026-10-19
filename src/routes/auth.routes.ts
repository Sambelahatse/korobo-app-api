import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { AppDataSource } from "../database/data-source";
import { AppUser, type AppUserRole } from "../entities/AppUser";
import { AuthSession } from "../entities/AuthSession";
import { env } from "../config/env";
import { authenticate, requireAdmin } from "../middleware/authenticate";
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  readRefreshCookie,
  refreshCookieOptions,
  refreshTokenLifetimeMs
} from "../services/authTokens";

export const authRouter = Router();

const ownerSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(40).optional()
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});
const inviteSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(["manager", "technician", "viewer"])
});
const setupSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128)
});
const setupLinkSchema = z.object({ email: z.string().trim().email().max(254) });

function tokenMatches(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function profilePayload(profile: AppUser) {
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    role: profile.role,
    phone: profile.phone,
    isActive: profile.isActive
  };
}

function setRefreshCookie(res: Parameters<typeof authRouter.post>[2] extends never ? never : any, token: string) {
  res.cookie("korobo_refresh", token, refreshCookieOptions());
}

async function issueSession(profile: AppUser, res: any) {
  const refreshToken = createRefreshToken();
  const session = AppDataSource.getRepository(AuthSession).create({
    userId: profile.id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + refreshTokenLifetimeMs()),
    revokedAt: null
  });
  await AppDataSource.getRepository(AuthSession).save(session);
  setRefreshCookie(res, refreshToken);
  return createAccessToken(profile.id);
}

authRouter.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Saisissez un e-mail et un mot de passe valides." } });
    return;
  }
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "La base de données est indisponible." } });
    return;
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const profile = await AppDataSource.getRepository(AppUser)
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("LOWER(user.email) = :email", { email })
      .getOne();

    const passwordHash = profile?.passwordHash;
    const passwordValid = passwordHash ? await compare(parsed.data.password, passwordHash) : false;
    if (!profile || !profile.isActive || !passwordValid) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "E-mail ou mot de passe incorrect." } });
      return;
    }

    const accessToken = await issueSession(profile, res);
    res.status(200).json({
      data: { profile: profilePayload(profile), accessToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  const rawToken = readRefreshCookie(req.headers.cookie);
  if (!rawToken) {
    res.status(401).json({ error: { code: "REFRESH_REQUIRED", message: "La session a expiré. Reconnectez-vous." } });
    return;
  }
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "La base de données est indisponible." } });
    return;
  }

  try {
    const sessionRepo = AppDataSource.getRepository(AuthSession);
    const session = await sessionRepo.findOne({
      where: { refreshTokenHash: hashToken(rawToken), revokedAt: null }
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) {
        session.revokedAt = new Date();
        await sessionRepo.save(session);
      }
      res.clearCookie("korobo_refresh", refreshCookieOptions());
      res.status(401).json({ error: { code: "REFRESH_EXPIRED", message: "La session a expiré. Reconnectez-vous." } });
      return;
    }

    const profile = await AppDataSource.getRepository(AppUser).findOne({ where: { id: session.userId } });
    if (!profile || !profile.isActive) {
      session.revokedAt = new Date();
      await sessionRepo.save(session);
      res.clearCookie("korobo_refresh", refreshCookieOptions());
      res.status(403).json({ error: { code: "ACCOUNT_NOT_ALLOWED", message: "Ce compte n'est pas actif." } });
      return;
    }

    // Rotate refresh credentials so a stolen token cannot be reused after refresh.
    session.revokedAt = new Date();
    await sessionRepo.save(session);
    const accessToken = await issueSession(profile, res);
    res.status(200).json({
      data: { profile: profilePayload(profile), accessToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const rawToken = readRefreshCookie(req.headers.cookie);
    if (rawToken && AppDataSource.isInitialized) {
      await AppDataSource.getRepository(AuthSession).update(
        { refreshTokenHash: hashToken(rawToken), revokedAt: null },
        { revokedAt: new Date() }
      );
    }
    res.clearCookie("korobo_refresh", refreshCookieOptions());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.post("/password/setup", async (req, res, next) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Le lien ou le mot de passe est invalide." } });
    return;
  }
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "La base de données est indisponible." } });
    return;
  }

  try {
    const repo = AppDataSource.getRepository(AppUser);
    const tokenHash = hashToken(parsed.data.token);
    const profile = await repo.createQueryBuilder("user")
      .addSelect("user.passwordSetupTokenHash")
      .addSelect("user.passwordSetupExpiresAt")
      .where("user.passwordSetupTokenHash = :tokenHash", { tokenHash })
      .getOne();

    if (!profile || !profile.isActive || !profile.passwordSetupExpiresAt ||
        profile.passwordSetupExpiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: { code: "SETUP_LINK_INVALID", message: "Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien à l'administrateur." } });
      return;
    }

    profile.passwordHash = await hash(parsed.data.password, 12);
    profile.passwordSetupTokenHash = null;
    profile.passwordSetupExpiresAt = null;
    await repo.save(profile);
    const accessToken = await issueSession(profile, res);
    res.status(200).json({ data: { profile: profilePayload(profile), accessToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/migration/setup-link", async (req, res, next) => {
  if (!tokenMatches(req.header("x-owner-bootstrap-token"), env.OWNER_BOOTSTRAP_TOKEN)) {
    res.status(403).json({ error: { code: "MIGRATION_TOKEN_INVALID", message: "La préparation de migration n'est pas autorisée." } });
    return;
  }
  const parsed = setupLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Saisissez une adresse e-mail valide." } });
    return;
  }
  try {
    const repo = AppDataSource.getRepository(AppUser);
    const profile = await repo.findOne({ where: { email: parsed.data.email.toLowerCase() } });
    if (!profile || !profile.isActive) {
      // Avoid revealing whether a specific email exists during migration.
      res.status(200).json({ message: "Si ce compte existe et est actif, un jeton de configuration a été préparé." });
      return;
    }
    const setupToken = randomBytes(32).toString("base64url");
    await repo.update(profile.id, {
      passwordSetupTokenHash: hashToken(setupToken),
      passwordSetupExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });
    res.status(200).json({
      data: { email: profile.email, setupToken, expiresInSeconds: 48 * 60 * 60 },
      message: "Transmettez le jeton par un canal sécurisé. Il ne sera affiché qu'une seule fois."
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/password/setup-link", authenticate, requireAdmin, async (req, res, next) => {
  const parsed = setupLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Saisissez une adresse e-mail valide." } });
    return;
  }
  try {
    const repo = AppDataSource.getRepository(AppUser);
    const profile = await repo.findOne({ where: { email: parsed.data.email.toLowerCase() } });
    if (!profile || !profile.isActive) {
      res.status(404).json({ error: { code: "ACCOUNT_NOT_FOUND", message: "Aucun compte actif ne correspond à cette adresse." } });
      return;
    }
    const setupToken = randomBytes(32).toString("base64url");
    await repo.update(profile.id, {
      passwordSetupTokenHash: hashToken(setupToken),
      passwordSetupExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });
    // No email provider is configured yet: expose this one-time link only to an authenticated admin.
    res.status(200).json({
      data: { email: profile.email, setupToken, expiresInSeconds: 48 * 60 * 60 },
      message: "Transmettez ce lien à l'utilisateur par un canal sécurisé. Le lien n'est affiché qu'une fois."
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/bootstrap-owner", async (req, res, next) => {
  if (!tokenMatches(req.header("x-owner-bootstrap-token"), env.OWNER_BOOTSTRAP_TOKEN)) {
    res.status(403).json({ error: { code: "BOOTSTRAP_TOKEN_INVALID", message: "La création du propriétaire n'est pas autorisée." } });
    return;
  }
  const parsed = ownerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Saisissez un nom, un e-mail et un mot de passe d'au moins 12 caractères." } });
    return;
  }
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "La base de données est indisponible." } });
    return;
  }

  const queryRunner = AppDataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query("SELECT pg_advisory_xact_lock($1)", [731904218]);
    if (await queryRunner.manager.count(AppUser) > 0) {
      await queryRunner.rollbackTransaction();
      res.status(409).json({ error: { code: "OWNER_ALREADY_CONFIGURED", message: "Le propriétaire initial est déjà créé." } });
      return;
    }
    const profile = queryRunner.manager.create(AppUser, {
      id: randomUUID(),
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await hash(parsed.data.password, 12),
      passwordSetupTokenHash: null,
      passwordSetupExpiresAt: null,
      role: "admin" satisfies AppUserRole,
      phone: parsed.data.phone || null,
      isActive: true
    });
    await queryRunner.manager.save(AppUser, profile);
    await queryRunner.commitTransaction();
    res.status(201).json({ data: profilePayload(profile), message: "Compte propriétaire créé. Retirez OWNER_BOOTSTRAP_TOKEN de l'environnement API." });
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction().catch(() => undefined);
    next(error);
  } finally {
    await queryRunner.release();
  }
});

authRouter.get("/me", authenticate, (req, res) => {
  res.status(200).json({ data: profilePayload(req.authProfile!) });
});

authRouter.post("/invite", authenticate, requireAdmin, async (req, res, next) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Saisissez un nom, un e-mail et un rôle autorisé." } });
    return;
  }
  try {
    const email = parsed.data.email.toLowerCase();
    const userRepo = AppDataSource.getRepository(AppUser);
    if (await userRepo.findOne({ where: { email } })) {
      res.status(409).json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Un compte existe déjà avec cette adresse e-mail." } });
      return;
    }
    const setupToken = randomBytes(32).toString("base64url");
    const profile = userRepo.create({
      id: randomUUID(),
      fullName: parsed.data.fullName,
      email,
      passwordHash: null,
      passwordSetupTokenHash: hashToken(setupToken),
      passwordSetupExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      role: parsed.data.role,
      phone: parsed.data.phone || null,
      isActive: true
    });
    await userRepo.save(profile);
    res.status(201).json({
      data: profilePayload(profile),
      setupToken,
      setupTokenExpiresInSeconds: 48 * 60 * 60,
      message: "Compte créé. Transmettez le jeton de première connexion à l'utilisateur par un canal sécurisé."
    });
  } catch (error) {
    next(error);
  }
});
