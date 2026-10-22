import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { env } from "../config/env";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured before running migrations.");
}

try {
  await AppDataSource.initialize();
  const migrations = await AppDataSource.runMigrations({ transaction: "all" });

  if (migrations.length === 0) {
    console.info("No pending database migrations.");
  } else {
    console.info(`Applied ${migrations.length} migration(s): ${migrations.map((migration) => migration.name).join(", ")}`);
  }
} catch (error) {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
} finally {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
