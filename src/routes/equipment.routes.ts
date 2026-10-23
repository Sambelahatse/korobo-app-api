import { Router } from "express";
import { z } from "zod";
import { IsNull } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { Equipment } from "../entities/Equipment";
import { Site } from "../entities/Site";
import { authenticate } from "../middleware/authenticate";

export const equipmentRouter = Router();
equipmentRouter.use(authenticate);

const statusSchema = z.enum(["operational", "warning", "faulty", "under_maintenance", "retired"]);
const modeSchema = z.enum(["individual", "quantity"]);
const equipmentSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(160).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(),
  trackingMode: modeSchema.default("individual"),
  quantity: z.number().int().min(1).max(1000000).default(1),
  unit: z.string().trim().min(1).max(40).default("unit"),
  status: statusSchema.default("operational"),
  assignedToId: z.string().uuid().nullable().optional(),
  installedAt: z.string().date().nullable().optional(),
  lastMaintenanceAt: z.string().date().nullable().optional(),
  nextMaintenanceAt: z.string().date().nullable().optional(),
  specifications: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(10000).nullable().optional()
}).superRefine((value, ctx) => {
  if (value.trackingMode === "individual") {
    if (!value.serialNumber) ctx.addIssue({ code: "custom", path: ["serialNumber"], message: "Le numéro de série est obligatoire pour un équipement suivi individuellement." });
    if (value.quantity !== 1) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Un équipement individuel doit avoir une quantité égale à 1." });
  } else if (value.serialNumber) {
    ctx.addIssue({ code: "custom", path: ["serialNumber"], message: "Le stock par quantité ne doit pas avoir de numéro de série unique." });
  }
});
const movementSchema = z.object({
  type: z.enum(["stock_in", "stock_out", "assign", "unassign", "transfer"]),
  quantity: z.number().int().min(1).max(1000000).default(1),
  toSiteId: z.string().uuid().optional(),
  toUserId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});
const maintenanceSchema = z.object({
  maintenanceType: z.enum(["preventive", "corrective"]).default("preventive"),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).default("planned"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10000).nullable().optional(),
  diagnosis: z.string().trim().max(10000).nullable().optional(),
  workPerformed: z.string().trim().max(10000).nullable().optional(),
  cost: z.number().min(0).max(9999999999).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional()
});

function canWrite(req: import("express").Request, res: import("express").Response): boolean {
  if (["admin", "manager", "technician"].includes(req.authProfile?.role ?? "")) return true;
  res.status(403).json({ error: { code: "EQUIPMENT_WRITE_FORBIDDEN", message: "Vous n’avez pas les droits nécessaires pour modifier les équipements." } });
  return false;
}
function fail(res: import("express").Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}
function recordMovement(input: {
  equipmentId: string; type: string; quantity?: number; fromSiteId?: string | null; toSiteId?: string | null;
  fromUserId?: string | null; toUserId?: string | null; notes?: string | null; createdBy?: string | null;
}) {
  return AppDataSource.query(
    `INSERT INTO public.equipment_movements
      (equipment_id, movement_type, quantity, from_site_id, to_site_id, from_user_id, to_user_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [input.equipmentId, input.type, input.quantity ?? 1, input.fromSiteId ?? null, input.toSiteId ?? null,
      input.fromUserId ?? null, input.toUserId ?? null, input.notes ?? null, input.createdBy ?? null]
  );
}

equipmentRouter.get("/", async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Equipment);
    const qb = repo.createQueryBuilder("equipment")
      .leftJoinAndSelect("equipment.site", "site")
      .leftJoinAndSelect("equipment.assignedTo", "assignedTo")
      .where("equipment.archivedAt IS NULL")
      .andWhere("equipment.organizationId = :organizationId", { organizationId: req.authProfile!.organizationId });
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) qb.andWhere("(equipment.name ILIKE :q OR equipment.category ILIKE :q OR equipment.serialNumber ILIKE :q OR equipment.brand ILIKE :q OR equipment.model ILIKE :q)", { q: `%${q}%` });
    if (typeof req.query.siteId === "string" && z.string().uuid().safeParse(req.query.siteId).success) qb.andWhere("equipment.siteId = :siteId", { siteId: req.query.siteId });
    if (typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success) qb.andWhere("equipment.status = :status", { status: req.query.status });
    if (typeof req.query.trackingMode === "string" && modeSchema.safeParse(req.query.trackingMode).success) qb.andWhere("equipment.trackingMode = :trackingMode", { trackingMode: req.query.trackingMode });
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "25"), 10) || 25));
    qb.orderBy("equipment.updatedAt", "DESC").skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

equipmentRouter.get("/lookups", async (req, res, next) => {
  try {
    const [sites, users] = await Promise.all([
      AppDataSource.getRepository(Site).find({ where: { organizationId: req.authProfile!.organizationId }, select: { id: true, name: true }, order: { name: "ASC" } }),
      AppDataSource.getRepository(AppUser).find({ where: { isActive: true, organizationId: req.authProfile!.organizationId }, select: { id: true, fullName: true, email: true, role: true }, order: { fullName: "ASC" } })
    ]);
    res.json({ data: { sites, users } });
  } catch (error) { next(error); }
});

equipmentRouter.get("/:id", async (req, res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) { fail(res, 400, "EQUIPMENT_ID_INVALID", "Identifiant d’équipement invalide."); return; }
  try {
    const equipment = await AppDataSource.getRepository(Equipment).findOne({
      where: { id: req.params.id, organizationId: req.authProfile!.organizationId, archivedAt: IsNull() }, relations: { site: true, assignedTo: true }
    });
    if (!equipment) { fail(res, 404, "EQUIPMENT_NOT_FOUND", "Équipement introuvable."); return; }
    const [movements, maintenance] = await Promise.all([
      AppDataSource.query(`SELECT m.*, fu.full_name AS from_user_name, tu.full_name AS to_user_name,
        fs.name AS from_site_name, ts.name AS to_site_name, creator.full_name AS created_by_name
        FROM public.equipment_movements m
        LEFT JOIN public.app_users fu ON fu.id=m.from_user_id
        LEFT JOIN public.app_users tu ON tu.id=m.to_user_id
        LEFT JOIN public.sites fs ON fs.id=m.from_site_id
        LEFT JOIN public.sites ts ON ts.id=m.to_site_id
        LEFT JOIN public.app_users creator ON creator.id=m.created_by
        WHERE m.equipment_id=$1 ORDER BY m.created_at DESC LIMIT 200`, [equipment.id]),
      AppDataSource.query(`SELECT m.*, u.full_name AS assigned_to_name, creator.full_name AS created_by_name
        FROM public.equipment_maintenance m
        LEFT JOIN public.app_users u ON u.id=m.assigned_to
        LEFT JOIN public.app_users creator ON creator.id=m.created_by
        WHERE m.equipment_id=$1 ORDER BY m.created_at DESC LIMIT 100`, [equipment.id])
    ]);
    res.json({ data: { ...equipment, movements, maintenance } });
  } catch (error) { next(error); }
});

equipmentRouter.post("/", async (req, res, next) => {
  if (!canWrite(req, res)) return;
  const parsed = equipmentSchema.safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Vérifiez les informations de l’équipement."); return; }
  const input = parsed.data;
  try {
    const site = await AppDataSource.getRepository(Site).findOne({ where: { id: input.siteId, organizationId: req.authProfile!.organizationId } });
    if (!site) { fail(res, 400, "SITE_NOT_FOUND", "Le site sélectionné n’existe pas."); return; }
    if (input.assignedToId && !await AppDataSource.getRepository(AppUser).findOne({ where: { id: input.assignedToId, isActive: true, organizationId: req.authProfile!.organizationId } })) {
      fail(res, 400, "ASSIGNEE_NOT_FOUND", "L’utilisateur affecté est introuvable ou inactif."); return;
    }
    const equipment = AppDataSource.getRepository(Equipment).create({
      ...input, organizationId: req.authProfile!.organizationId, brand: input.brand ?? null, model: input.model ?? null, serialNumber: input.serialNumber ?? null,
      assignedToId: input.assignedToId ?? null, installedAt: input.installedAt ?? null,
      lastMaintenanceAt: input.lastMaintenanceAt ?? null, nextMaintenanceAt: input.nextMaintenanceAt ?? null,
      notes: input.notes ?? null, archivedAt: null,
      availableQuantity: input.trackingMode === "individual" ? (input.assignedToId ? 0 : 1) : Math.max(0, input.quantity - (input.assignedToId ? input.quantity : 0)),
      assignedQuantity: input.assignedToId ? input.quantity : 0
    });
    await AppDataSource.transaction(async manager => {
      await manager.save(Equipment, equipment);
      await manager.query(
        `INSERT INTO public.equipment_movements (equipment_id,movement_type,quantity,to_site_id,to_user_id,notes,created_by)
         VALUES ($1,'created',$2,$3,$4,$5,$6)`,
        [equipment.id, input.quantity, input.siteId, input.assignedToId ?? null, "Création de l’équipement", req.authProfile!.id]
      );
    });
    res.status(201).json({ data: await AppDataSource.getRepository(Equipment).findOne({ where: { id: equipment.id, organizationId: req.authProfile!.organizationId }, relations: { site: true, assignedTo: true } }) });
  } catch (error) { next(error); }
});

equipmentRouter.patch("/:id", async (req, res, next) => {
  if (!canWrite(req, res)) return;
  if (!z.string().uuid().safeParse(req.params.id).success) { fail(res, 400, "EQUIPMENT_ID_INVALID", "Identifiant d’équipement invalide."); return; }
  const parsed = equipmentSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(req.body ?? {}).length === 0) { fail(res, 400, "VALIDATION_ERROR", parsed.success ? "Aucune modification fournie." : parsed.error.issues[0]?.message ?? "Données invalides."); return; }
  try {
    const repo = AppDataSource.getRepository(Equipment);
    const equipment = await repo.findOne({ where: { id: req.params.id, organizationId: req.authProfile!.organizationId, archivedAt: IsNull() } });
    if (!equipment) { fail(res, 404, "EQUIPMENT_NOT_FOUND", "Équipement introuvable."); return; }
    const input = parsed.data;
    if (input.siteId && !await AppDataSource.getRepository(Site).findOne({ where: { id: input.siteId } })) { fail(res, 400, "SITE_NOT_FOUND", "Le site sélectionné n’existe pas."); return; }
    if (input.assignedToId && !await AppDataSource.getRepository(AppUser).findOne({ where: { id: input.assignedToId, isActive: true } })) { fail(res, 400, "ASSIGNEE_NOT_FOUND", "L’utilisateur affecté est introuvable ou inactif."); return; }
    if (equipment.trackingMode === "individual" && input.quantity !== undefined && input.quantity !== 1) { fail(res, 400, "INDIVIDUAL_QUANTITY_INVALID", "Un équipement individuel doit conserver une quantité égale à 1."); return; }
    const previousSiteId = equipment.siteId;
    const previousUserId = equipment.assignedToId;
    if (input.siteId !== undefined) equipment.siteId = input.siteId;
    if (input.name !== undefined) equipment.name = input.name;
    if (input.category !== undefined) equipment.category = input.category;
    if (input.brand !== undefined) equipment.brand = input.brand;
    if (input.model !== undefined) equipment.model = input.model;
    if (input.serialNumber !== undefined) equipment.serialNumber = input.serialNumber;
    if (input.trackingMode !== undefined) equipment.trackingMode = input.trackingMode;
    if (input.quantity !== undefined) equipment.quantity = input.quantity;
    if (input.unit !== undefined) equipment.unit = input.unit;
    if (input.status !== undefined) equipment.status = input.status;
    if (input.assignedToId !== undefined) equipment.assignedToId = input.assignedToId;
    if (input.installedAt !== undefined) equipment.installedAt = input.installedAt;
    if (input.lastMaintenanceAt !== undefined) equipment.lastMaintenanceAt = input.lastMaintenanceAt;
    if (input.nextMaintenanceAt !== undefined) equipment.nextMaintenanceAt = input.nextMaintenanceAt;
    if (input.specifications !== undefined) equipment.specifications = input.specifications;
    if (input.notes !== undefined) equipment.notes = input.notes;
    if (equipment.trackingMode === "individual") {
      equipment.quantity = 1;
      equipment.assignedQuantity = equipment.assignedToId ? 1 : 0;
      equipment.availableQuantity = equipment.assignedToId ? 0 : 1;
    } else {
      equipment.serialNumber = null;
      equipment.assignedQuantity = Math.min(equipment.assignedQuantity, equipment.quantity);
      equipment.availableQuantity = Math.max(0, equipment.quantity - equipment.assignedQuantity);
    }
    await AppDataSource.transaction(async manager => {
      await manager.save(Equipment, equipment);
      await manager.query(
        `INSERT INTO public.equipment_movements (equipment_id,movement_type,quantity,from_site_id,to_site_id,from_user_id,to_user_id,notes,created_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)`,
        [equipment.id, previousSiteId !== equipment.siteId ? "transfer" : previousUserId !== equipment.assignedToId ? (equipment.assignedToId ? "assigned" : "unassigned") : "updated",
          previousSiteId, equipment.siteId, previousUserId, equipment.assignedToId, "Mise à jour de la fiche équipement", req.authProfile!.id]
      );
    });
    res.json({ data: await repo.findOne({ where: { id: equipment.id }, relations: { site: true, assignedTo: true } }) });
  } catch (error) { next(error); }
});

equipmentRouter.post("/:id/movements", async (req, res, next) => {
  if (!canWrite(req, res)) return;
  if (!z.string().uuid().safeParse(req.params.id).success) { fail(res, 400, "EQUIPMENT_ID_INVALID", "Identifiant d’équipement invalide."); return; }
  const parsed = movementSchema.safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Mouvement invalide."); return; }
  try {
    await AppDataSource.transaction(async manager => {
      const repo = manager.getRepository(Equipment);
      const equipment = await repo.findOne({ where: { id: req.params.id, archivedAt: IsNull() }, lock: { mode: "pessimistic_write" } });
      if (!equipment) throw Object.assign(new Error("Équipement introuvable."), { status: 404, code: "EQUIPMENT_NOT_FOUND" });
      const { type, quantity, toSiteId, toUserId, notes } = parsed.data;
      const amount = equipment.trackingMode === "individual" ? 1 : quantity;
      const fromSiteId = equipment.siteId;
      const fromUserId = equipment.assignedToId;
      if (type === "stock_in") {
        if (equipment.trackingMode !== "quantity") throw Object.assign(new Error("L’entrée de stock s’applique uniquement aux articles suivis par quantité."), { status: 400, code: "MOVEMENT_MODE_INVALID" });
        equipment.quantity += amount; equipment.availableQuantity += amount;
      } else if (type === "stock_out") {
        if (equipment.trackingMode !== "quantity" || equipment.availableQuantity < amount) throw Object.assign(new Error("Stock disponible insuffisant pour cette sortie."), { status: 409, code: "STOCK_INSUFFICIENT" });
        equipment.quantity -= amount; equipment.availableQuantity -= amount;
      } else if (type === "assign") {
        if (equipment.availableQuantity < amount || !toUserId) throw Object.assign(new Error("Quantité disponible insuffisante ou utilisateur manquant."), { status: 409, code: "ASSIGNMENT_INVALID" });
        const user = await manager.getRepository(AppUser).findOne({ where: { id: toUserId, isActive: true, organizationId: req.authProfile!.organizationId } });
        if (!user) throw Object.assign(new Error("L’utilisateur affecté est introuvable ou inactif."), { status: 400, code: "ASSIGNEE_NOT_FOUND" });
        if (equipment.trackingMode === "individual" && equipment.assignedToId) throw Object.assign(new Error("Cet équipement est déjà affecté."), { status: 409, code: "ALREADY_ASSIGNED" });
        equipment.availableQuantity -= amount; equipment.assignedQuantity += amount;
        if (equipment.trackingMode === "individual") equipment.assignedToId = toUserId;
      } else if (type === "unassign") {
        if (equipment.assignedQuantity < amount) throw Object.assign(new Error("La quantité affectée est insuffisante."), { status: 409, code: "ASSIGNED_QUANTITY_INSUFFICIENT" });
        equipment.availableQuantity += amount; equipment.assignedQuantity -= amount;
        if (equipment.trackingMode === "individual") equipment.assignedToId = null;
      } else if (type === "transfer") {
        if (!toSiteId) throw Object.assign(new Error("Sélectionnez le site de destination."), { status: 400, code: "DESTINATION_REQUIRED" });
        if (!await manager.getRepository(Site).findOne({ where: { id: toSiteId, organizationId: req.authProfile!.organizationId } })) throw Object.assign(new Error("Le site de destination n’existe pas."), { status: 400, code: "SITE_NOT_FOUND" });
        equipment.siteId = toSiteId;
      }
      await manager.save(Equipment, equipment);
      await manager.query(
        `INSERT INTO public.equipment_movements (equipment_id,movement_type,quantity,from_site_id,to_site_id,from_user_id,to_user_id,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [equipment.id, type, amount, fromSiteId, equipment.siteId, fromUserId, type === "assign" ? toUserId : type === "unassign" ? null : fromUserId, notes ?? null, req.authProfile!.id]
      );
    });
    res.status(201).json({ message: "Mouvement enregistré." });
  } catch (error) {
    const e = error as Error & { status?: number; code?: string };
    if (e.status) { fail(res, e.status, e.code ?? "MOVEMENT_FAILED", e.message); return; }
    next(error);
  }
});

equipmentRouter.get("/:id/maintenance", async (req, res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) { fail(res, 400, "EQUIPMENT_ID_INVALID", "Identifiant d’équipement invalide."); return; }
  try {
    const equipment = await AppDataSource.getRepository(Equipment).findOne({ where: { id: req.params.id, organizationId: req.authProfile!.organizationId, archivedAt: IsNull() } });
    if (!equipment) { fail(res, 404, "EQUIPMENT_NOT_FOUND", "Équipement introuvable."); return; }
    const data = await AppDataSource.query(
      `SELECT m.*, u.full_name AS assigned_to_name FROM public.equipment_maintenance m
       LEFT JOIN public.app_users u ON u.id=m.assigned_to WHERE m.equipment_id=$1 ORDER BY m.created_at DESC`,
      [req.params.id]
    );
    res.json({ data });
  } catch (error) { next(error); }
});

equipmentRouter.post("/:id/maintenance", async (req, res, next) => {
  if (!canWrite(req, res)) return;
  if (!z.string().uuid().safeParse(req.params.id).success) { fail(res, 400, "EQUIPMENT_ID_INVALID", "Identifiant d’équipement invalide."); return; }
  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Intervention invalide."); return; }
  try {
    const equipment = await AppDataSource.getRepository(Equipment).findOne({ where: { id: req.params.id, archivedAt: IsNull() } });
    if (!equipment) { fail(res, 404, "EQUIPMENT_NOT_FOUND", "Équipement introuvable."); return; }
    const m = parsed.data;
    const rows = await AppDataSource.query(
      `INSERT INTO public.equipment_maintenance
       (equipment_id,maintenance_type,status,priority,title,description,diagnosis,work_performed,cost,scheduled_at,next_due_at,assigned_to,created_by,started_at,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         CASE WHEN $3='in_progress' THEN now() ELSE NULL END,
         CASE WHEN $3='completed' THEN now() ELSE NULL END) RETURNING *`,
      [equipment.id, m.maintenanceType, m.status, m.priority, m.title, m.description ?? null, m.diagnosis ?? null,
        m.workPerformed ?? null, m.cost ?? null, m.scheduledAt ?? null, m.nextDueAt ?? null, m.assignedToId ?? null, req.authProfile!.id]
    );
    if (m.status === "in_progress") equipment.status = "under_maintenance";
    if (m.status === "completed") { equipment.lastMaintenanceAt = new Date().toISOString().slice(0, 10); equipment.nextMaintenanceAt = m.nextDueAt?.slice(0, 10) ?? null; }
    await AppDataSource.getRepository(Equipment).save(equipment);
    await recordMovement({ equipmentId: equipment.id, type: m.status === "completed" ? "maintenance_completed" : "maintenance_started", fromSiteId: equipment.siteId, toSiteId: equipment.siteId, notes: m.title, createdBy: req.authProfile!.id });
    res.status(201).json({ data: rows[0] });
  } catch (error) { next(error); }
});

equipmentRouter.patch("/maintenance/:maintenanceId", async (req, res, next) => {
  if (!canWrite(req, res)) return;
  if (!z.string().uuid().safeParse(req.params.maintenanceId).success) { fail(res, 400, "MAINTENANCE_ID_INVALID", "Identifiant d’intervention invalide."); return; }
  const parsed = maintenanceSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(req.body ?? {}).length === 0) { fail(res, 400, "VALIDATION_ERROR", parsed.success ? "Aucune modification fournie." : parsed.error.issues[0]?.message ?? "Intervention invalide."); return; }
  try {
    const existing = await AppDataSource.query("SELECT m.* FROM public.equipment_maintenance m JOIN public.equipment e ON e.id = m.equipment_id WHERE m.id=$1 AND e.organization_id=$2 LIMIT 1", [req.params.maintenanceId, req.authProfile!.organizationId]) as Array<Record<string, unknown>>;
    if (!existing.length) { fail(res, 404, "MAINTENANCE_NOT_FOUND", "Intervention introuvable."); return; }
    const current = existing[0]!;
    const patch = parsed.data;
    const merged = {
      equipment_id: current.equipment_id,
      maintenanceType: patch.maintenanceType ?? current.maintenance_type,
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      title: patch.title ?? current.title,
      description: patch.description !== undefined ? patch.description : current.description,
      diagnosis: patch.diagnosis !== undefined ? patch.diagnosis : current.diagnosis,
      workPerformed: patch.workPerformed !== undefined ? patch.workPerformed : current.work_performed,
      cost: patch.cost !== undefined ? patch.cost : current.cost,
      scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : current.scheduled_at,
      nextDueAt: patch.nextDueAt !== undefined ? patch.nextDueAt : current.next_due_at,
      assignedToId: patch.assignedToId !== undefined ? patch.assignedToId : current.assigned_to
    };
    const rows = await AppDataSource.query(
      `UPDATE public.equipment_maintenance SET maintenance_type=$2,status=$3,priority=$4,title=$5,description=$6,diagnosis=$7,work_performed=$8,cost=$9,scheduled_at=$10,next_due_at=$11,assigned_to=$12,
       started_at=CASE WHEN $3='in_progress' THEN COALESCE(started_at,now()) ELSE started_at END,
       completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.maintenanceId, merged.maintenanceType, merged.status, merged.priority, merged.title, merged.description ?? null,
        merged.diagnosis ?? null, merged.workPerformed ?? null, merged.cost ?? null, merged.scheduledAt ?? null, merged.nextDueAt ?? null, merged.assignedToId ?? null]
    );
    const equipment = await AppDataSource.getRepository(Equipment).findOne({ where: { id: String(existing[0]!.equipment_id), organizationId: req.authProfile!.organizationId } });
    if (equipment && merged.status === "in_progress") equipment.status = "under_maintenance";
    if (equipment && merged.status === "completed") {
      equipment.status = "operational";
      equipment.lastMaintenanceAt = new Date().toISOString().slice(0, 10);
      equipment.nextMaintenanceAt = typeof merged.nextDueAt === "string" ? merged.nextDueAt.slice(0, 10) : null;
    }
    if (equipment) await AppDataSource.getRepository(Equipment).save(equipment);
    if (equipment && merged.status !== current.status && (merged.status === "in_progress" || merged.status === "completed")) {
      await recordMovement({
        equipmentId: equipment.id,
        type: merged.status === "completed" ? "maintenance_completed" : "maintenance_started",
        fromSiteId: equipment.siteId,
        toSiteId: equipment.siteId,
        notes: String(merged.title ?? "Intervention de maintenance"),
        createdBy: req.authProfile!.id
      });
    }
    res.json({ data: rows[0] });
  } catch (error) { next(error); }
});

equipmentRouter.delete("/:id", async (req, res, next) => {
  if (!canWrite(req, res)) return;
  if (!z.string().uuid().safeParse(req.params.id).success) { fail(res, 400, "EQUIPMENT_ID_INVALID", "Identifiant d’équipement invalide."); return; }
  try {
    const repo = AppDataSource.getRepository(Equipment);
    const equipment = await repo.findOne({ where: { id: req.params.id, archivedAt: IsNull() } });
    if (!equipment) { fail(res, 404, "EQUIPMENT_NOT_FOUND", "Équipement introuvable."); return; }
    equipment.archivedAt = new Date();
    await AppDataSource.transaction(async manager => {
      await manager.save(Equipment, equipment);
      await manager.query(
        `INSERT INTO public.equipment_movements (equipment_id,movement_type,quantity,from_site_id,from_user_id,notes,created_by)
         VALUES ($1,'archived',$2,$3,$4,$5,$6)`,
        [equipment.id, equipment.quantity, equipment.siteId, equipment.assignedToId, "Archivage logique de l’équipement", req.authProfile!.id]
      );
    });
    res.status(204).end();
  } catch (error) { next(error); }
});
