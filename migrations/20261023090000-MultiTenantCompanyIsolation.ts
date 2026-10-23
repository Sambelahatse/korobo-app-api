import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Introduces tenant ownership without discarding existing KOROBO data.
 * Existing records are assigned to a single legacy workspace; new signups
 * create a fresh company and owner atomically.
 */
export class MultiTenantCompanyIsolation20261023090000 implements MigrationInterface {
  name = "MultiTenantCompanyIsolation20261023090000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(180) NOT NULL,
        slug varchar(200) NOT NULL UNIQUE,
        owner_user_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS company_id uuid NULL`);
    await queryRunner.query(`ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS company_id uuid NULL`);

    // Preserve existing installations by grouping all current data into one workspace.
    await queryRunner.query(`
      INSERT INTO public.companies (name, slug)
      SELECT 'KOROBO - espace existant', 'korobo-espace-existant'
      WHERE NOT EXISTS (SELECT 1 FROM public.companies)
    `);
    await queryRunner.query(`
      UPDATE public.app_users
      SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
      WHERE company_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE public.sites
      SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
      WHERE company_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE public.companies c SET owner_user_id = (
        SELECT u.id FROM public.app_users u
        WHERE u.company_id = c.id ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at ASC LIMIT 1
      ) WHERE c.owner_user_id IS NULL
    `);
    await queryRunner.query(`ALTER TABLE public.app_users ALTER COLUMN company_id SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE public.sites ALTER COLUMN company_id SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE public.app_users ADD CONSTRAINT app_users_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE public.sites ADD CONSTRAINT sites_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE public.companies ADD CONSTRAINT companies_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS app_users_company_id_idx ON public.app_users(company_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS sites_company_id_idx ON public.sites(company_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS sites_company_name_unique_idx ON public.sites(company_id, lower(name))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS public.sites_company_name_unique_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.sites_company_id_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.app_users_company_id_idx`);
    await queryRunner.query(`ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_company_id_fkey`);
    await queryRunner.query(`ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_company_id_fkey`);
    await queryRunner.query(`ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_owner_user_id_fkey`);
    await queryRunner.query(`ALTER TABLE public.sites DROP COLUMN IF EXISTS company_id`);
    await queryRunner.query(`ALTER TABLE public.app_users DROP COLUMN IF EXISTS company_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.companies`);
  }
}