import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { env } from "../config/env";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be configured before applying the auth schema.");

try {
  await AppDataSource.initialize();
  await AppDataSource.query(`ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS password_hash varchar(255)`);
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS public.auth_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL UNIQUE,
      purpose varchar(20) NOT NULL CHECK (purpose IN ('invite', 'password_reset')),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await AppDataSource.query(`CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON public.auth_tokens (user_id, purpose)`);
  console.info("Neon authentication schema is ready. Existing application tables and user profiles were preserved.");
} catch (error) {
  console.error("Could not apply the additive authentication schema.", error);
  process.exitCode = 1;
} finally {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
