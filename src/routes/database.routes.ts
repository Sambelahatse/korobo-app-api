import { Router } from "express";
import { AppDataSource } from "../database/data-source";
import { authenticate, requireAdmin } from "../middleware/authenticate";

export const databaseRouter = Router();
databaseRouter.use(authenticate, requireAdmin);

type TableDefinition = {
  name: string;
  label: string;
  countSql: string;
};

const tables: TableDefinition[] = [
  { name: "companies", label: "Entreprises", countSql: "SELECT COUNT(*)::int AS count FROM public.companies WHERE id = $1" },
  { name: "app_users", label: "Utilisateurs", countSql: "SELECT COUNT(*)::int AS count FROM public.app_users WHERE company_id = $1" },
  { name: "sites", label: "Sites", countSql: "SELECT COUNT(*)::int AS count FROM public.sites WHERE company_id = $1" },
  { name: "equipment", label: "Équipements", countSql: "SELECT COUNT(*)::int AS count FROM public.equipment e INNER JOIN public.sites s ON s.id = e.site_id WHERE s.company_id = $1" },
  { name: "planifications", label: "Planifications", countSql: "SELECT COUNT(*)::int AS count FROM public.planifications p INNER JOIN public.sites s ON s.id = p.site_id WHERE s.company_id = $1" },
  { name: "rapports", label: "Rapports", countSql: "SELECT COUNT(*)::int AS count FROM public.rapports r INNER JOIN public.sites s ON s.id = r.site_id WHERE s.company_id = $1" },
  { name: "notifications", label: "Notifications", countSql: "SELECT COUNT(*)::int AS count FROM public.notifications WHERE company_id = $1" },
  { name: "auth_tokens", label: "Jetons d’authentification", countSql: "SELECT COUNT(*)::int AS count FROM public.auth_tokens t INNER JOIN public.app_users u ON u.id = t.user_id WHERE u.company_id = $1" },
  { name: "auth_sessions", label: "Sessions", countSql: "SELECT COUNT(*)::int AS count FROM public.auth_sessions s INNER JOIN public.app_users u ON u.id = s.user_id WHERE u.company_id = $1" },
  { name: "account_preferences", label: "Préférences des comptes", countSql: "SELECT COUNT(*)::int AS count FROM public.account_preferences p INNER JOIN public.app_users u ON u.id = p.user_id WHERE u.company_id = $1" }
];

databaseRouter.get("/overview", async (req, res, next) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "La base de données n’est pas disponible." } });
    return;
  }

  try {
    const companyId = req.authProfile!.companyId;
    const existingRows = await AppDataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    ) as Array<{ table_name: string }>;
    const existing = new Set(existingRows.map((row) => row.table_name));

    const results = await Promise.all(tables.map(async (table) => {
      if (!existing.has(table.name)) {
        return { name: table.name, label: table.label, count: null, available: false };
      }
      const rows = await AppDataSource.query(table.countSql, [companyId]) as Array<{ count: number }>;
      return { name: table.name, label: table.label, count: Number(rows[0]?.count ?? 0), available: true };
    }));

    const totalRecords = results.reduce((total, table) => total + (table.count ?? 0), 0);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: {
        status: "connected",
        checkedAt: new Date().toISOString(),
        totalRecords,
        tables: results
      }
    });
  } catch (error) {
    next(error);
  }
});
