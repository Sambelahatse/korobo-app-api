import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../database/data-source";
import { AppUser, type AppUserRole } from "../entities/AppUser";
import { env } from "../config/env";
import { getSupabaseAdminClient } from "../config/supabase-admin";
import { authenticate, requireAdmin } from "../middleware/authenticate";

export const authRouter = Router();

const ownerSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
});

const inviteSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(["manager", "technician", "viewer"])
});

function tokenMatches(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

authRouter.post("/bootstrap-owner", async (req, res, next) => {
  const candidate = req.header("x-owner-bootstrap-token");
  if (!tokenMatches(candidate, env.OWNER_BOOTSTRAP_TOKEN)) {
    res.status(403).json({
      error: { code: "BOOTSTRAP_TOKEN_INVALID", message: "Owner setup is not authorized." }
    });
    return;
  }

  const parsed = ownerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Enter a valid name, email, and password (at least 12 characters)." }
    });
    return;
  }

  if (!AppDataSource.isInitialized) {
    res.status(503).json({
      error: { code: "DATABASE_UNAVAILABLE", message: "The database is not ready." }
    });
    return;
  }

  const queryRunner = AppDataSource.createQueryRunner();
  let createdAuthUserId: string | undefined;
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();
    // Serialize bootstrap attempts so only one request can claim the first-owner slot.
    await queryRunner.query("SELECT pg_advisory_xact_lock($1)", [731904218]);
    const existingCount = await queryRunner.manager.count(AppUser);
    if (existingCount > 0) {
      await queryRunner.rollbackTransaction();
      res.status(409).json({
        error: { code: "OWNER_ALREADY_CONFIGURED", message: "The initial owner has already been created. Ask an administrator for an invitation." }
      });
      return;
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName }
    });
    if (error || !data.user) {
      await queryRunner.rollbackTransaction();
      res.status(400).json({
        error: { code: "OWNER_CREATION_FAILED", message: error?.message ?? "Unable to create the owner account." }
      });
      return;
    }
    createdAuthUserId = data.user.id;

    const profile = queryRunner.manager.create(AppUser, {
      id: data.user.id,
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      role: "admin" satisfies AppUserRole,
      phone: null,
      isActive: true
    });
    await queryRunner.manager.save(AppUser, profile);
    await queryRunner.commitTransaction();

    res.status(201).json({
      data: {
        id: profile.id,
        fullName: profile.fullName,
        email: profile.email,
        role: profile.role,
        isActive: profile.isActive
      },
      message: "Owner account created. Remove OWNER_BOOTSTRAP_TOKEN from the API environment now."
    });
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction().catch(() => undefined);
    if (createdAuthUserId) {
      await getSupabaseAdminClient().auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
    }
    next(error);
  } finally {
    await queryRunner.release();
  }
});

authRouter.get("/me", authenticate, (req, res) => {
  const profile = req.authProfile!;
  res.status(200).json({
    data: {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      role: profile.role,
      phone: profile.phone,
      isActive: profile.isActive
    }
  });
});

authRouter.post("/invite", authenticate, requireAdmin, async (req, res, next) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Enter a valid name, email, and allowed role." }
    });
    return;
  }

  if (!AppDataSource.isInitialized) {
    res.status(503).json({
      error: { code: "DATABASE_UNAVAILABLE", message: "The database is not ready." }
    });
    return;
  }

  try {
    const { fullName, email, phone, role } = parsed.data;
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName }
    });
    if (error || !data.user) {
      res.status(400).json({
        error: { code: "INVITATION_FAILED", message: error?.message ?? "Unable to invite this user." }
      });
      return;
    }

    try {
      const profile = AppDataSource.getRepository(AppUser).create({
        id: data.user.id,
        fullName,
        email: email.toLowerCase(),
        role,
        phone: phone || null,
        isActive: true
      });
      await AppDataSource.getRepository(AppUser).save(profile);
      res.status(201).json({
        data: {
          id: profile.id,
          fullName: profile.fullName,
          email: profile.email,
          role: profile.role,
          phone: profile.phone,
          isActive: profile.isActive
        },
        message: "Invitation sent."
      });
    } catch (error) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});
