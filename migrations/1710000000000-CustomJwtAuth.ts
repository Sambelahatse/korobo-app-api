import type { MigrationInterface, QueryRunner } from "typeorm";

export class CustomJwtAuth1710000000000 implements MigrationInterface {
  name = "CustomJwtAuth1710000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.app_users
        ADD COLUMN IF NOT EXISTS password_hash varchar(100),
        ADD COLUMN IF NOT EXISTS password_setup_token_hash varchar(64),
        ADD COLUMN IF NOT EXISTS password_setup_expires_at timestamptz
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.auth_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
        refresh_token_hash varchar(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_sessions_user_id"
      ON public.auth_sessions(user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.auth_sessions');
    await queryRunner.query(`
      ALTER TABLE public.app_users
        DROP COLUMN IF EXISTS password_setup_expires_at,
        DROP COLUMN IF EXISTS password_setup_token_hash,
        DROP COLUMN IF EXISTS password_hash
    `);
  }
}
