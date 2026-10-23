import type { MigrationInterface, QueryRunner } from "typeorm";

export class PlanificationAndReports20261023120000 implements MigrationInterface {
  name = "PlanificationAndReports20261023120000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.planifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
        title varchar(180) NOT NULL,
        description text NULL,
        maintenance_type varchar(80) NULL,
        scheduled_at timestamptz NOT NULL,
        duration_minutes integer NULL CHECK (duration_minutes IS NULL OR duration_minutes > 0),
        status varchar(30) NOT NULL DEFAULT 'planned'
          CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
        assigned_to uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS planifications_site_id_idx ON public.planifications(site_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS planifications_scheduled_at_idx ON public.planifications(scheduled_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS planifications_status_idx ON public.planifications(status)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.rapports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
        planification_id uuid NULL REFERENCES public.planifications(id) ON DELETE SET NULL,
        title varchar(180) NOT NULL,
        report_date date NOT NULL DEFAULT CURRENT_DATE,
        status varchar(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated')),
        summary text NULL,
        findings jsonb NOT NULL DEFAULT '[]'::jsonb,
        actions_taken text NULL,
        recommendations text NULL,
        created_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        validated_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        validated_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS rapports_site_id_idx ON public.rapports(site_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS rapports_report_date_idx ON public.rapports(report_date)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS rapports_status_idx ON public.rapports(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.rapports`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.planifications`);
  }
}
