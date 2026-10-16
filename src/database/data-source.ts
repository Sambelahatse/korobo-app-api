import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";
import { AppUser } from "../entities/AppUser";
import { Site } from "../entities/Site";
import { Equipment } from "../entities/Equipment";
import { Planification } from "../entities/Planification";
import { Rapport } from "../entities/Rapport";

export const AppDataSource = new DataSource({
  type: "postgres",
  ...(env.DATABASE_URL ? { url: env.DATABASE_URL } : {}),
  ssl: env.DATABASE_URL
    ? {
        rejectUnauthorized: true,
        ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } : {})
      }
    : false,
  entities: [AppUser, Site, Equipment, Planification, Rapport],
  migrations: ["migrations/*.{ts,js}"],
  synchronize: false,
  migrationsRun: false,
  logging: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  applicationName: "korobo-app-api"
});

export async function initializeDatabase(): Promise<void> {
  if (!env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set; starting API without a database connection.");
    return;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.info("PostgreSQL connection established.");
  }
}
