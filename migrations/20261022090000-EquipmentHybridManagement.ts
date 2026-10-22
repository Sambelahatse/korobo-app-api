import { MigrationInterface, QueryRunner } from "typeorm";

export class EquipmentHybridManagement20261022090000 implements MigrationInterface {
  name = "EquipmentHybridManagement20261022090000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.equipment
        ADD COLUMN IF NOT EXISTS tracking_mode varchar(20) NOT NULL DEFAULT 'individual',
        ADD COLUMN IF NOT EXISTS available_quantity integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS assigned_quantity integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS assigned_to uuid NULL,
        ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL
    `);
    await queryRunner.query(`
      UPDATE public.equipment
      SET tracking_mode = CASE
        WHEN serial_number IS NOT NULL AND btrim(serial_number) <> '' THEN 'individual'
        ELSE 'quantity'
      END,
      available_quantity = CASE
        WHEN serial_number IS NOT NULL AND btrim(serial_number) <> '' THEN 0
        ELSE GREATEST(quantity, 0)
      END,
      assigned_quantity = 0
    `);
    await queryRunner.query(`
      ALTER TABLE public.equipment
        ADD CONSTRAINT equipment_tracking_mode_check CHECK (tracking_mode IN ('individual', 'quantity')),
        ADD CONSTRAINT equipment_quantity_nonnegative_check CHECK (quantity >= 0 AND available_quantity >= 0 AND assigned_quantity >= 0),
        ADD CONSTRAINT equipment_assigned_quantity_check CHECK (assigned_quantity <= quantity)
    `);
    await queryRunner.query(`
      ALTER TABLE public.equipment
        ADD CONSTRAINT equipment_assigned_to_fkey FOREIGN KEY (assigned_to)
        REFERENCES public.app_users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE public.equipment DROP CONSTRAINT IF EXISTS equipment_site_id_fkey
    `);
    await queryRunner.query(`
      ALTER TABLE public.equipment
        ADD CONSTRAINT equipment_site_id_fkey FOREIGN KEY (site_id)
        REFERENCES public.sites(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS equipment_tracking_mode_idx ON public.equipment(tracking_mode)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS equipment_assigned_to_idx ON public.equipment(assigned_to)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS equipment_serial_number_unique_idx ON public.equipment(serial_number) WHERE serial_number IS NOT NULL AND btrim(serial_number) <> ''`);

    await queryRunner.query(`
      CREATE TABLE public.equipment_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
        movement_type varchar(30) NOT NULL CHECK (movement_type IN ('created', 'updated', 'assigned', 'unassigned', 'transfer', 'stock_in', 'stock_out', 'maintenance_started', 'maintenance_completed', 'archived', 'restored')),
        quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
        from_site_id uuid NULL REFERENCES public.sites(id) ON DELETE SET NULL,
        to_site_id uuid NULL REFERENCES public.sites(id) ON DELETE SET NULL,
        from_user_id uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        to_user_id uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        notes text NULL,
        created_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX equipment_movements_equipment_created_idx ON public.equipment_movements(equipment_id, created_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE public.equipment_maintenance (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
        maintenance_type varchar(20) NOT NULL CHECK (maintenance_type IN ('preventive', 'corrective')),
        status varchar(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
        priority varchar(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        title varchar(180) NOT NULL,
        description text NULL,
        diagnosis text NULL,
        work_performed text NULL,
        cost numeric(12,2) NULL CHECK (cost IS NULL OR cost >= 0),
        scheduled_at timestamptz NULL,
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        next_due_at timestamptz NULL,
        assigned_to uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        created_by uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX equipment_maintenance_equipment_idx ON public.equipment_maintenance(equipment_id, scheduled_at DESC)`);
    await queryRunner.query(`CREATE INDEX equipment_maintenance_status_idx ON public.equipment_maintenance(status, scheduled_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.equipment_maintenance`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.equipment_movements`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.equipment_serial_number_unique_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.equipment_assigned_to_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS public.equipment_tracking_mode_idx`);
    await queryRunner.query(`ALTER TABLE public.equipment DROP CONSTRAINT IF EXISTS equipment_site_id_fkey`);
    await queryRunner.query(`
      ALTER TABLE public.equipment
        ADD CONSTRAINT equipment_site_id_fkey FOREIGN KEY (site_id)
        REFERENCES public.sites(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE public.equipment
        DROP CONSTRAINT IF EXISTS equipment_assigned_to_fkey,
        DROP CONSTRAINT IF EXISTS equipment_assigned_quantity_check,
        DROP CONSTRAINT IF EXISTS equipment_quantity_nonnegative_check,
        DROP CONSTRAINT IF EXISTS equipment_tracking_mode_check,
        DROP COLUMN IF EXISTS archived_at,
        DROP COLUMN IF EXISTS assigned_to,
        DROP COLUMN IF EXISTS assigned_quantity,
        DROP COLUMN IF EXISTS available_quantity,
        DROP COLUMN IF EXISTS tracking_mode
    `);
  }
}
