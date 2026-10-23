import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { Planification } from "../entities/Planification";
import { Site } from "../entities/Site";
import { authenticate } from "../middleware/authenticate";

export const planificationsRouter = Router();
planificationsRouter.use(authenticate);

const statusSchema = z.enum(["planned", "in_progress", "completed", "cancelled"]);
const planificationSchema = z.object({
  siteId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10000).nullable().optional(),
  maintenanceType: z.string().trim().max(80).nullable().optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().max(10080).nullable().optional(),
  status: statusSchema.default("planned"),
  assignedToId: z.string().uuid().nullable().optional()
});
const canWrite = (role: string | undefined) => ["admin", "manager", "technician"].includes(role ?? "");

planificationsRouter.get("/", async (req, res, next) => {
  try {
    const qb = AppDataSource.getRepository(Planification).createQueryBuilder("p")
      .innerJoinAndSelect("p.site", "site")
      .leftJoinAndSelect("p.assignedTo", "assignedTo")
      .where("site.companyId = :companyId", { companyId: req.authProfile!.companyId });
    if (typeof req.query.siteId === "string" && z.string().uuid().safeParse(req.query.siteId).success) {
      qb.andWhere("p.siteId = :siteId", { siteId: req.query.siteId });
    }
    if (typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success) {
      qb.andWhere("p.status = :status", { status: req.query.status });
    }
    if (typeof req.query.from === "string" && !Number.isNaN(Date.parse(req.query.from))) {
      qb.andWhere("p.scheduledAt >= :from", { from: new Date(req.query.from).toISOString() });
    }
    if (typeof req.query.to === "string" && !Number.isNaN(Date.parse(req.query.to))) {
      qb.andWhere("p.scheduledAt < :to", { to: new Date(req.query.to).toISOString() });
    }
    const data = await qb.orderBy("p.scheduledAt", "ASC").getMany();
    res.json({ data });
  } catch (error) { next(error); }
});

planificationsRouter.post("/", async (req, res, next) => {
  if (!canWrite(req.authProfile?.role)) {
    res.status(403).json({ error: { code: "PLANIFICATION_WRITE_FORBIDDEN", message: "Vous n’avez pas les droits pour créer une intervention." } });
    return;
  }
  const parsed = planificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Vérifiez les informations de l’intervention." } });
    return;
  }
  try {
    const input = parsed.data;
    const site = await AppDataSource.getRepository(Site).findOne({ where: { id: input.siteId, companyId: req.authProfile!.companyId } });
    if (!site) {
      res.status(404).json({ error: { code: "SITE_NOT_FOUND", message: "Site introuvable dans votre espace." } });
      return;
    }
    if (input.assignedToId) {
      const user = await AppDataSource.getRepository(AppUser).findOne({ where: { id: input.assignedToId, companyId: req.authProfile!.companyId, isActive: true } });
      if (!user) {
        res.status(400).json({ error: { code: "INVALID_ASSIGNEE", message: "Le technicien sélectionné n’est pas actif dans votre espace." } });
        return;
      }
    }
    const repo = AppDataSource.getRepository(Planification);
    const item = repo.create({
      ...input,
      scheduledAt: new Date(input.scheduledAt),
      description: input.description ?? null,
      maintenanceType: input.maintenanceType ?? null,
      durationMinutes: input.durationMinutes ?? null,
      assignedToId: input.assignedToId ?? null,
      createdById: req.authProfile!.id
    });
    await repo.save(item);
    const data = await repo.findOne({ where: { id: item.id }, relations: { site: true, assignedTo: true } });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

planificationsRouter.patch("/:id", async (req, res, next) => {
  if (!canWrite(req.authProfile?.role)) {
    res.status(403).json({ error: { code: "PLANIFICATION_WRITE_FORBIDDEN", message: "Vous n’avez pas les droits pour modifier une intervention." } });
    return;
  }
  const parsed = planificationSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Vérifiez les informations de l’intervention." } });
    return;
  }
  try {
    const repo = AppDataSource.getRepository(Planification);
    const item = await repo.createQueryBuilder("p")
      .innerJoinAndSelect("p.site", "site")
      .where("p.id = :id AND site.companyId = :companyId", { id: req.params.id, companyId: req.authProfile!.companyId })
      .getOne();
    if (!item) {
      res.status(404).json({ error: { code: "PLANIFICATION_NOT_FOUND", message: "Intervention introuvable." } });
      return;
    }
    const input = parsed.data;
    if (input.siteId) {
      const site = await AppDataSource.getRepository(Site).findOne({ where: { id: input.siteId, companyId: req.authProfile!.companyId } });
      if (!site) {
        res.status(404).json({ error: { code: "SITE_NOT_FOUND", message: "Site introuvable dans votre espace." } });
        return;
      }
    }
    if (input.assignedToId) {
      const user = await AppDataSource.getRepository(AppUser).findOne({ where: { id: input.assignedToId, companyId: req.authProfile!.companyId, isActive: true } });
      if (!user) {
        res.status(400).json({ error: { code: "INVALID_ASSIGNEE", message: "Le technicien sélectionné n’est pas actif dans votre espace." } });
        return;
      }
    }
    Object.assign(item, input);
    if (input.scheduledAt !== undefined) item.scheduledAt = new Date(input.scheduledAt);
    if (input.description !== undefined) item.description = input.description;
    if (input.maintenanceType !== undefined) item.maintenanceType = input.maintenanceType;
    if (input.durationMinutes !== undefined) item.durationMinutes = input.durationMinutes;
    if (input.assignedToId !== undefined) item.assignedToId = input.assignedToId;
    await repo.save(item);
    const data = await repo.findOne({ where: { id: item.id }, relations: { site: true, assignedTo: true } });
    res.json({ data });
  } catch (error) { next(error); }
});

planificationsRouter.delete("/:id", async (req, res, next) => {
  if (!canWrite(req.authProfile?.role)) {
    res.status(403).json({ error: { code: "PLANIFICATION_WRITE_FORBIDDEN", message: "Vous n’avez pas les droits pour supprimer une intervention." } });
    return;
  }
  try {
    const repo = AppDataSource.getRepository(Planification);
    const item = await repo.createQueryBuilder("p")
      .innerJoin("p.site", "site")
      .where("p.id = :id AND site.companyId = :companyId", { id: req.params.id, companyId: req.authProfile!.companyId })
      .getOne();
    if (!item) {
      res.status(404).json({ error: { code: "PLANIFICATION_NOT_FOUND", message: "Intervention introuvable." } });
      return;
    }
    await repo.remove(item);
    res.status(204).send();
  } catch (error) { next(error); }
});
