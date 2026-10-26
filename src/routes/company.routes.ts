import { Router } from "express";
import { z } from "zod";
import { AppDataSource } from "../database/data-source";
import { Company } from "../entities/Company";
import { authenticate } from "../middleware/authenticate";
import { emitCompanyEvent } from "../services/realtime";

export const companyRouter = Router();
companyRouter.use(authenticate);

const companySchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).nullable(),
  sector: z.string().trim().max(160).nullable(),
  legalForm: z.string().trim().max(120).nullable(),
  taxId: z.string().trim().max(120).nullable(),
  statisticalId: z.string().trim().max(120).nullable(),
  address: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(160).nullable(),
  region: z.string().trim().max(160).nullable(),
  country: z.string().trim().max(120).nullable(),
  phone: z.string().trim().max(40).nullable(),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).nullable(),
  website: z.union([z.string().trim().url().max(500), z.literal("")]).nullable(),
  logoUrl: z.union([z.string().trim().url().max(1000), z.literal("")]).nullable()
});

function serialize(company: Company) {
  return {
    id: company.id, name: company.name, description: company.description, sector: company.sector,
    legalForm: company.legalForm, taxId: company.taxId, statisticalId: company.statisticalId,
    address: company.address, city: company.city, region: company.region, country: company.country,
    phone: company.phone, email: company.email, website: company.website, logoUrl: company.logoUrl,
    ownerUserId: company.ownerUserId, createdAt: company.createdAt, updatedAt: company.updatedAt
  };
}

companyRouter.get("/", async (req, res, next) => {
  try {
    const company = await AppDataSource.getRepository(Company).findOne({ where: { id: req.authProfile!.companyId } });
    if (!company) { res.status(404).json({ error: { code: "COMPANY_NOT_FOUND", message: "Entreprise introuvable." } }); return; }
    res.json({ data: serialize(company) });
  } catch (error) { next(error); }
});

companyRouter.patch("/", async (req, res, next) => {
  if (req.authProfile?.role !== "admin") {
    res.status(403).json({ error: { code: "COMPANY_WRITE_FORBIDDEN", message: "Seul un administrateur de l’entreprise peut modifier ses informations." } });
    return;
  }
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Vérifiez les informations de l’entreprise." } });
    return;
  }
  try {
    const repository = AppDataSource.getRepository(Company);
    const company = await repository.findOne({ where: { id: req.authProfile!.companyId } });
    if (!company) { res.status(404).json({ error: { code: "COMPANY_NOT_FOUND", message: "Entreprise introuvable." } }); return; }
    const input = parsed.data;
    company.name = input.name;
    company.description = input.description || null;
    company.sector = input.sector || null;
    company.legalForm = input.legalForm || null;
    company.taxId = input.taxId || null;
    company.statisticalId = input.statisticalId || null;
    company.address = input.address || null;
    company.city = input.city || null;
    company.region = input.region || null;
    company.country = input.country || null;
    company.phone = input.phone || null;
    company.email = input.email || null;
    company.website = input.website || null;
    company.logoUrl = input.logoUrl || null;
    await repository.save(company);
    emitCompanyEvent({ resource: "settings", action: "updated", entityId: company.id, companyId: req.authProfile!.companyId, actorId: req.authProfile!.id });
    res.json({ data: serialize(company) });
  } catch (error) { next(error); }
});
