import type { MigrationInterface, QueryRunner } from "typeorm";

export class RapportMetadata20261023150000 implements MigrationInterface {
  name = "RapportMetadata20261023150000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.rapports
      ADD COLUMN IF NOT EXISTS report_type varchar(30) NOT NULL DEFAULT 'intervention'
        CHECK (report_type IN ('mensuel', 'incident', 'intervention')),
      ADD COLUMN IF NOT EXISTS technician_id uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS rapports_technician_id_idx ON public.rapports(technician_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS public.rapports_technician_id_idx`);
    await queryRunner.query(`ALTER TABLE public.rapports DROP COLUMN IF EXISTS technician_id, DROP COLUMN IF EXISTS report_type`);
  }
}
