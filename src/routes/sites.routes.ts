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
  ownerEmail: z.union([z.string().trim().email().max(254), z.literal("")]).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  installationYear: z.number().int().min(1900).max(2200).nullable().optional(),
  installationType: z.string().trim().max(100).nullable().optional(),
  powerKw: z.number().min(0).max(999999999).nullable().optional(),
  installerName: z.string().trim().max(180).nullable().optional(),
  installerPhone: z.string().trim().max(40).nullable().optional(),
  electricalInstallation: z.string().trim().max(10000).nullable().optional(),
  batteries: z.array(z.unknown()).optional(),
  pvTypes: z.array(z.unknown()).optional(),
  mttpTypes: z.array(z.unknown()).optional(),
  controllers: z.array(z.unknown()).optional(),
  generatorInfo: z.record(z.string(), z.unknown()).optional(),
  savContractFileName: z.string().trim().max(500).nullable().optional(),
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
    if (existing) { res.status(409).json({ error: { code: "SITE_ALREADY_EXISTS", message: "Un site porte déjà ce nom." } }); return; }
    const site = repository.create({
      ...input,
      ownerEmail: input.ownerEmail || null,
      powerKw: input.powerKw == null ? null : String(input.powerKw),
      latitude: input.latitude == null ? null : String(input.latitude),
      longitude: input.longitude == null ? null : String(input.longitude),
      installerName: input.installerName ?? null,
      installerPhone: input.installerPhone ?? null,
      electricalInstallation: input.electricalInstallation ?? null,
      batteries: input.batteries ?? [],
      pvTypes: input.pvTypes ?? [],
      mttpTypes: input.mttpTypes ?? [],
      controllers: input.controllers ?? [],
      generatorInfo: input.generatorInfo ?? {},
      savContractFileName: input.savContractFileName ?? null,
      caseNumber: input.caseNumber ?? null,
      ownerPhone: input.ownerPhone ?? null,
      installationYear: input.installationYear ?? null,
      installationType: input.installationType ?? null,
      notes: input.notes ?? null
    });
    await repository.save(site);
    res.status(201).json({ data: site });
  } catch (error) { next(error); }
});

sitesRouter.patch("/:id", async (req, res, next) => {
  if (!["admin", "manager"].includes(req.authProfile?.role ?? "")) {
    res.status(403).json({ error: { code: "SITE_WRITE_FORBIDDEN", message: "Seuls les administrateurs et responsables peuvent modifier un site." } });
    return;
  }
  const parsed = siteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Vérifiez les informations du site." } });
    return;
  }
  try {
    const repository = AppDataSource.getRepository(Site);
    const site = await repository.findOne({ where: { id: req.params.id } });
    if (!site) { res.status(404).json({ error: { code: "SITE_NOT_FOUND", message: "Site introuvable." } }); return; }
    const input = parsed.data;
    if (input.name && input.name.toLocaleLowerCase() !== site.name.toLocaleLowerCase()) {
      const duplicate = await repository.createQueryBuilder("site")
        .where("LOWER(site.name) = LOWER(:name)", { name: input.name }).andWhere("site.id != :id", { id: site.id }).getOne();
      if (duplicate) { res.status(409).json({ error: { code: "SITE_ALREADY_EXISTS", message: "Un site porte déjà ce nom." } }); return; }
    }
    Object.assign(site, input);
    if (input.powerKw !== undefined) site.powerKw = input.powerKw == null ? null : String(input.powerKw);
    if (input.latitude !== undefined) site.latitude = input.latitude == null ? null : String(input.latitude);
    if (input.longitude !== undefined) site.longitude = input.longitude == null ? null : String(input.longitude);
    if (input.ownerEmail !== undefined) site.ownerEmail = input.ownerEmail || null;
    await repository.save(site);
    res.json({ data: site });
  } catch (error) { next(error); }
});

sitesRouter.delete("/:id", async (req, res, next) => {
  if (!["admin", "manager"].includes(req.authProfile?.role ?? "")) {
    res.status(403).json({ error: { code: "SITE_WRITE_FORBIDDEN", message: "Seuls les administrateurs et responsables peuvent supprimer un site." } });
    return;
  }
  try {
    const repository = AppDataSource.getRepository(Site);
    const site = await repository.findOne({ where: { id: req.params.id }, relations: { equipment: true, planifications: true, rapports: true } });
    if (!site) { res.status(404).json({ error: { code: "SITE_NOT_FOUND", message: "Site introuvable." } }); return; }
    if (site.equipment?.length || site.planifications?.length || site.rapports?.length) {
      res.status(409).json({ error: { code: "SITE_IN_USE", message: "Ce site est lié à des équipements, planifications ou rapports. Désactivez-le plutôt que de le supprimer." } });
      return;
    }
    await repository.remove(site);
    res.status(204).send();
  } catch (error) { next(error); }
});
