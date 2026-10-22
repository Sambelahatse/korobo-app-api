import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { env } from "../config/env";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be configured before applying the auth schema.");

try {
  await AppDataSource.initialize();
  await AppDataSource.query(`ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS password_hash varchar(255)`);
  await AppDataSource.query(`ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS google_sub varchar(255)`);
  await AppDataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS app_users_google_sub_unique_idx ON public.app_users (google_sub) WHERE google_sub IS NOT NULL`);
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
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS public.auth_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
      token_id varchar(64) NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      user_agent text,
      ip_address inet
    )
  `);
  await AppDataSource.query(`CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx ON public.auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL`);
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS public.account_preferences (
      user_id uuid PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
      preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  console.info("Neon authentication schema is ready. Existing application tables and user profiles were preserved.");
} catch (error) {
  console.error("Could not apply the additive authentication schema.", error);
  process.exitCode = 1;
} finally {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
