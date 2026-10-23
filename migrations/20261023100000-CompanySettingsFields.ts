import type { MigrationInterface, QueryRunner } from "typeorm";

export class CompanySettingsFields20261023100000 implements MigrationInterface {
  name = "CompanySettingsFields20261023100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.companies
      ADD COLUMN IF NOT EXISTS description varchar(2000) NULL,
      ADD COLUMN IF NOT EXISTS sector varchar(160) NULL,
      ADD COLUMN IF NOT EXISTS legal_form varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS tax_id varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS statistical_id varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS address varchar(500) NULL,
      ADD COLUMN IF NOT EXISTS city varchar(160) NULL,
      ADD COLUMN IF NOT EXISTS region varchar(160) NULL,
      ADD COLUMN IF NOT EXISTS country varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS phone varchar(40) NULL,
      ADD COLUMN IF NOT EXISTS email varchar(254) NULL,
      ADD COLUMN IF NOT EXISTS website varchar(500) NULL,
      ADD COLUMN IF NOT EXISTS logo_url varchar(1000) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.companies
      DROP COLUMN IF EXISTS logo_url,
      DROP COLUMN IF EXISTS website,
      DROP COLUMN IF EXISTS email,
      DROP COLUMN IF EXISTS phone,
      DROP COLUMN IF EXISTS country,
      DROP COLUMN IF EXISTS region,
      DROP COLUMN IF EXISTS city,
      DROP COLUMN IF EXISTS address,
      DROP COLUMN IF EXISTS statistical_id,
      DROP COLUMN IF EXISTS tax_id,
      DROP COLUMN IF EXISTS legal_form,
      DROP COLUMN IF EXISTS sector,
      DROP COLUMN IF EXISTS description
    `);
  }
}