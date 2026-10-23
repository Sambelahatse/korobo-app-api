import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { Organization } from "../entities/Organization";
import { AppUser } from "../entities/AppUser";

export const registrationRouter = Router();

const registrationSchema = z.object({
  companyName: z.string().trim().min(2).max(180),
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(40).optional()
});

registrationRouter.post("/", async (req, res, next) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Renseignez le nom de l’entreprise, le nom du propriétaire, un e-mail valide et un mot de passe d’au moins 12 caractères."
      }
    });
    return;
  }
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "L’inscription est temporairement indisponible." } });
    return;
  }

  const input = parsed.data;
  const email = input.email.toLowerCase();
  const runner = AppDataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();

    const existing = await runner.manager.createQueryBuilder(AppUser, "user")
      .where("LOWER(user.email) = LOWER(:email)", { email })
      .getOne();
    if (existing) {
      await runner.rollbackTransaction();
      res.status(409).json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Un compte utilise déjà cette adresse e-mail." } });
      return;
    }

    const organization = runner.manager.create(Organization, {
      id: randomUUID(),
      name: input.companyName
    });
    await runner.manager.save(Organization, organization);

    const owner = runner.manager.create(AppUser, {
      id: randomUUID(),
      fullName: input.fullName,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      googleSub: null,
      role: "admin",
      phone: input.phone?.trim() || null,
      isActive: true,
      organizationId: organization.id
    });
    await runner.manager.save(AppUser, owner);
    await runner.commitTransaction();

    res.status(201).json({
      data: {
        organization: { id: organization.id, name: organization.name },
        owner: {
          id: owner.id,
          fullName: owner.fullName,
          email: owner.email,
          role: owner.role,
          phone: owner.phone,
          isActive: owner.isActive
        }
      },
      message: "Entreprise créée. Vous pouvez maintenant vous connecter en tant qu’administrateur."
    });
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
    next(error);
  } finally {
    await runner.release();
  }
});
