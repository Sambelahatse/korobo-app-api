import type { MigrationInterface, QueryRunner } from "typeorm";

export class PublicSiteIdentifier20261024100000 implements MigrationInterface {
  name = "PublicSiteIdentifier20261024100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS public.sites_public_id_seq START WITH 1
    `);
    await queryRunner.query(`
      ALTER TABLE public.sites
      ADD COLUMN IF NOT EXISTS public_id varchar(30)
    `);
    await queryRunner.query(`
      WITH numbered_sites AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS number
        FROM public.sites
        WHERE public_id IS NULL
      )
      UPDATE public.sites AS site
      SET public_id = 'ST-' || numbered_sites.number::text
      FROM numbered_sites
      WHERE site.id = numbered_sites.id
    `);
    await queryRunner.query(`
      SELECT setval(
        'public.sites_public_id_seq',
        GREATEST(COALESCE((SELECT MAX(SUBSTRING(public_id FROM 4)::bigint) FROM public.sites WHERE public_id ~ '^ST-[0-9]+$'), 0), 1),
        COALESCE((SELECT MAX(SUBSTRING(public_id FROM 4)::bigint) FROM public.sites WHERE public_id ~ '^ST-[0-9]+$'), 0) > 0
      )
    `);
    await queryRunner.query(`
      ALTER TABLE public.sites
      ALTER COLUMN public_id SET DEFAULT ('ST-' || nextval('public.sites_public_id_seq')::text),
      ALTER COLUMN public_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sites_public_id_unique_idx ON public.sites(public_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS public.sites_public_id_unique_idx`);
    await queryRunner.query(`ALTER TABLE public.sites DROP COLUMN IF EXISTS public_id`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS public.sites_public_id_seq`);
  }
}
