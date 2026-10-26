import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { Planification } from "../entities/Planification";
import { Rapport } from "../entities/Rapport";
import { Site } from "../entities/Site";
import { authenticate } from "../middleware/authenticate";
import { emitCompanyEvent } from "../services/realtime";

export const rapportsRouter = Router();
rapportsRouter.use(authenticate);

const typeSchema = z.enum(["mensuel", "incident", "intervention"]);
const statusSchema = z.enum(["draft", "validated"]);
const reportSchema = z.object({
  siteId: z.string().uuid(),
  planificationId: z.string().uuid().nullable().optional(),
  technicianId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(180),
  reportType: typeSchema.default("intervention"),
  reportDate: z.string().date(),
  summary: z.string().trim().max(20000).nullable().optional(),
  findings: z.array(z.unknown()).max(200).optional(),
  actionsTaken: z.string().trim().max(20000).nullable().optional(),
  recommendations: z.string().trim().max(20000).nullable().optional(),
  status: statusSchema.optional()
});
const canWrite = (role: string | undefined) => ["admin", "manager", "technician"].includes(role ?? "");
const canValidate = (role: string | undefined) => ["admin", "manager"].includes(role ?? "");
function fail(res: import("express").Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}
async function findTenantSite(siteId: string, companyId: string) {
  return AppDataSource.getRepository(Site).findOne({ where: { id: siteId, companyId } });
}

rapportsRouter.get("/", async (req, res, next) => {
  try {
    const qb = AppDataSource.getRepository(Rapport).createQueryBuilder("rapport")
      .innerJoinAndSelect("rapport.site", "site")
      .leftJoinAndSelect("rapport.technician", "technician")
      .leftJoinAndSelect("rapport.createdBy", "createdBy")
      .leftJoinAndSelect("rapport.validatedBy", "validatedBy")
      .leftJoinAndSelect("rapport.planification", "planification")
      .where("site.companyId = :companyId", { companyId: req.authProfile!.companyId });
    if (typeof req.query.siteId === "string" && z.string().uuid().safeParse(req.query.siteId).success) {
      qb.andWhere("rapport.siteId = :siteId", { siteId: req.query.siteId });
    }
    if (typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success) {
      qb.andWhere("rapport.status = :status", { status: req.query.status });
    }
    if (typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) qb.andWhere("rapport.reportDate >= :from", { from: req.query.from });
    if (typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) qb.andWhere("rapport.reportDate <= :to", { to: req.query.to });
    const data = await qb.orderBy("rapport.reportDate", "DESC").addOrderBy("rapport.createdAt", "DESC").getMany();
    res.json({ data });
  } catch (error) { next(error); }
});

rapportsRouter.post("/", async (req, res, next) => {
  if (!canWrite(req.authProfile?.role)) { fail(res, 403, "REPORT_WRITE_FORBIDDEN", "Vous n’avez pas les droits pour créer un rapport."); return; }
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Vérifiez les informations du rapport."); return; }
  try {
    const input = parsed.data;
    const site = await findTenantSite(input.siteId, req.authProfile!.companyId);
    if (!site) { fail(res, 404, "SITE_NOT_FOUND", "Site introuvable dans votre espace."); return; }
    if (input.planificationId) {
      const planification = await AppDataSource.getRepository(Planification).createQueryBuilder("p")
        .innerJoin("p.site", "site").where("p.id = :id AND site.companyId = :companyId", { id: input.planificationId, companyId: req.authProfile!.companyId }).getOne();
      if (!planification || planification.siteId !== input.siteId) { fail(res, 400, "INVALID_PLANIFICATION", "L’intervention sélectionnée ne correspond pas au site."); return; }
    }
    if (input.technicianId && !await AppDataSource.getRepository(AppUser).findOne({ where: { id: input.technicianId, companyId: req.authProfile!.companyId, isActive: true } })) {
      fail(res, 400, "INVALID_TECHNICIAN", "Le technicien sélectionné n’est pas actif dans votre entreprise."); return;
    }
    const repo = AppDataSource.getRepository(Rapport);
    const item = repo.create({
      ...input,
      planificationId: input.planificationId ?? null,
      technicianId: input.technicianId ?? null,
      summary: input.summary ?? null,
      findings: input.findings ?? [],
      actionsTaken: input.actionsTaken ?? null,
      recommendations: input.recommendations ?? null,
      status: input.status ?? "draft",
      createdById: req.authProfile!.id,
      validatedById: input.status === "validated" && canValidate(req.authProfile?.role) ? req.authProfile!.id : null,
      validatedAt: input.status === "validated" && canValidate(req.authProfile?.role) ? new Date() : null
    });
    if (input.status === "validated" && !canValidate(req.authProfile?.role)) { fail(res, 403, "REPORT_VALIDATE_FORBIDDEN", "Seuls les administrateurs et responsables peuvent valider un rapport."); return; }
    await repo.save(item);
    emitCompanyEvent({ resource: "rapport", action: "created", entityId: item.id, companyId: req.authProfile!.companyId, actorId: req.authProfile!.id });
    const data = await repo.findOne({ where: { id: item.id }, relations: { site: true, technician: true, createdBy: true, validatedBy: true, planification: true } });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

rapportsRouter.patch("/:id", async (req, res, next) => {
  if (!canWrite(req.authProfile?.role)) { fail(res, 403, "REPORT_WRITE_FORBIDDEN", "Vous n’avez pas les droits pour modifier un rapport."); return; }
  const parsed = reportSchema.partial().safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Vérifiez les informations du rapport."); return; }
  try {
    const repo = AppDataSource.getRepository(Rapport);
    const item = await repo.createQueryBuilder("rapport").innerJoinAndSelect("rapport.site", "site")
      .where("rapport.id = :id AND site.companyId = :companyId", { id: req.params.id, companyId: req.authProfile!.companyId }).getOne();
    if (!item) { fail(res, 404, "REPORT_NOT_FOUND", "Rapport introuvable."); return; }
    if (item.status === "validated" && !canValidate(req.authProfile?.role)) { fail(res, 403, "REPORT_LOCKED", "Seul un administrateur ou responsable peut modifier un rapport validé."); return; }
    const input = parsed.data;
    if (input.status === "validated" && !canValidate(req.authProfile?.role)) { fail(res, 403, "REPORT_VALIDATE_FORBIDDEN", "Seuls les administrateurs et responsables peuvent valider un rapport."); return; }
    if (input.siteId) {
      const site = await findTenantSite(input.siteId, req.authProfile!.companyId);
      if (!site) { fail(res, 404, "SITE_NOT_FOUND", "Site introuvable dans votre espace."); return; }
    }
    if (input.planificationId) {
      const planification = await AppDataSource.getRepository(Planification).createQueryBuilder("p").innerJoin("p.site", "site")
        .where("p.id = :id AND site.companyId = :companyId", { id: input.planificationId, companyId: req.authProfile!.companyId }).getOne();
      if (!planification || planification.siteId !== (input.siteId ?? item.siteId)) { fail(res, 400, "INVALID_PLANIFICATION", "L’intervention sélectionnée ne correspond pas au site."); return; }
    }
    if (input.technicianId && !await AppDataSource.getRepository(AppUser).findOne({ where: { id: input.technicianId, companyId: req.authProfile!.companyId, isActive: true } })) {
      fail(res, 400, "INVALID_TECHNICIAN", "Le technicien sélectionné n’est pas actif dans votre entreprise."); return;
    }
    Object.assign(item, input);
    if (input.planificationId !== undefined) item.planificationId = input.planificationId;
    if (input.technicianId !== undefined) item.technicianId = input.technicianId;
    if (input.summary !== undefined) item.summary = input.summary;
    if (input.findings !== undefined) item.findings = input.findings;
    if (input.actionsTaken !== undefined) item.actionsTaken = input.actionsTaken;
    if (input.recommendations !== undefined) item.recommendations = input.recommendations;
    if (input.status === "validated") { item.validatedById = req.authProfile!.id; item.validatedAt = new Date(); }
    if (input.status === "draft") { item.validatedById = null; item.validatedAt = null; }
    await repo.save(item);
    emitCompanyEvent({ resource: "rapport", action: "updated", entityId: item.id, companyId: req.authProfile!.companyId, actorId: req.authProfile!.id });
    const data = await repo.findOne({ where: { id: item.id }, relations: { site: true, technician: true, createdBy: true, validatedBy: true, planification: true } });
    res.json({ data });
  } catch (error) { next(error); }
});

rapportsRouter.delete("/:id", async (req, res, next) => {
  if (!canWrite(req.authProfile?.role)) { fail(res, 403, "REPORT_DELETE_FORBIDDEN", "Vous n’avez pas les droits pour supprimer un rapport."); return; }
  try {
    const repo = AppDataSource.getRepository(Rapport);
    const item = await repo.createQueryBuilder("rapport").innerJoin("rapport.site", "site")
      .where("rapport.id = :id AND site.companyId = :companyId", { id: req.params.id, companyId: req.authProfile!.companyId }).getOne();
    if (!item) { fail(res, 404, "REPORT_NOT_FOUND", "Rapport introuvable."); return; }
    if (item.status === "validated" && !canValidate(req.authProfile?.role)) { fail(res, 403, "REPORT_LOCKED", "Seul un administrateur ou responsable peut supprimer un rapport validé."); return; }
    await repo.remove(item);
    emitCompanyEvent({ resource: "rapport", action: "deleted", entityId: item.id, companyId: req.authProfile!.companyId, actorId: req.authProfile!.id });
    res.status(204).send();
  } catch (error) { next(error); }
});
