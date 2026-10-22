import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../database/data-source";
import { Site } from "../entities/Site";
import { authenticate } from "../middleware/authenticate";

export const sitesRouter = Router();
sitesRouter.use(authenticate);

const siteSchema = z.object({
  name: z.string().trim().min(1).max(180),
  location: z.string().trim().min(1).max(2000),
  ownerName: z.string().trim().min(1).max(180),
  caseNumber: z.string().trim().max(80).nullable().optional(),
  ownerPhone: z.string().trim().max(40).nullable().optional(),
  ownerEmail: z.string().trim().email().max(254).nullable().optional(),
  installationYear: z.number().int().min(1900).max(2200).nullable().optional(),
  installationType: z.string().trim().max(100).nullable().optional(),
  powerKw: z.number().min(0).max(999999999).nullable().optional(),
  status: z.enum(["active", "inactive", "maintenance", "terminated"]).default("active"),
  notes: z.string().trim().max(10000).nullable().optional()
});

sitesRouter.get("/", async (_req, res, next) => {
  try {
    const data = await AppDataSource.getRepository(Site).find({ order: { name: "ASC" } });
    res.json({ data });
  } catch (error) { next(error); }
});

sitesRouter.post("/", async (req, res, next) => {
  if (!["admin", "manager"].includes(req.authProfile?.role ?? "")) {
    res.status(403).json({ error: { code: "SITE_WRITE_FORBIDDEN", message: "Seuls les administrateurs et responsables peuvent créer un site." } });
    return;
  }
  const parsed = siteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Vérifiez les informations du site." } });
    return;
  }
  try {
    const input = parsed.data;
    const repository = AppDataSource.getRepository(Site);
    const existing = await repository.findOne({ where: { name: input.name } });
    if (existing) { res.status(200).json({ data: existing, existing: true }); return; }
    const site = repository.create({
      name: input.name, location: input.location, ownerName: input.ownerName,
      caseNumber: input.caseNumber ?? null, ownerPhone: input.ownerPhone ?? null,
      ownerEmail: input.ownerEmail ?? null, installationYear: input.installationYear ?? null,
      installationType: input.installationType ?? null, powerKw: input.powerKw == null ? null : String(input.powerKw),
      status: input.status, notes: input.notes ?? null, latitude: null, longitude: null,
      installerName: null, installerPhone: null, electricalInstallation: null,
      batteries: [], pvTypes: [], mttpTypes: [], controllers: [], generatorInfo: {}, savContractFileName: null
    });
    await repository.save(site);
    res.status(201).json({ data: site, existing: false });
  } catch (error) { next(error); }
});
