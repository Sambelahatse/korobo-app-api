import type { MigrationInterface, QueryRunner } from "typeorm";

export class PersistentNotifications20261023170000 implements MigrationInterface {
  name = "PersistentNotifications20261023170000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
        recipient_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
        type varchar(30) NOT NULL DEFAULT 'info' CHECK (type IN ('alerte', 'avertissement', 'info', 'succès')),
        title varchar(180) NOT NULL,
        message text NOT NULL,
        site_name varchar(180) NULL,
        link varchar(500) NULL,
        is_read boolean NOT NULL DEFAULT false,
        read_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON public.notifications(company_id, recipient_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications(company_id, recipient_id) WHERE is_read = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.notifications`);
  }
}
