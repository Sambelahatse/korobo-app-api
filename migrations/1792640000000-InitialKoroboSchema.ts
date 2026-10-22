import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialKoroboSchema1792640000000 implements MigrationInterface {
  name = "InitialKoroboSchema1792640000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "public"."app_users" (
        "id" uuid NOT NULL,
        "full_name" character varying(160) NOT NULL,
        "email" character varying(254) NOT NULL,
        "role" character varying(40) NOT NULL DEFAULT 'technician',
        "phone" character varying(40),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_app_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."sites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "case_number" character varying(80),
        "name" character varying(180) NOT NULL,
        "location" text NOT NULL,
        "owner_name" character varying(180) NOT NULL,
        "owner_phone" character varying(40),
        "owner_email" character varying(254),
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "installation_year" smallint,
        "installation_type" character varying(100),
        "power_kw" numeric(12,3),
        "installer_name" character varying(180),
        "installer_phone" character varying(40),
        "electrical_installation" text,
        "batteries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "pv_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "mttp_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "controllers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "generator_info" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "sav_contract_file_name" text,
        "status" character varying(30) NOT NULL DEFAULT 'active',
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sites_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."equipment" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "name" character varying(180) NOT NULL,
        "category" character varying(80) NOT NULL,
        "brand" character varying(120),
        "model" character varying(160),
        "serial_number" character varying(160),
        "quantity" integer NOT NULL DEFAULT 1,
        "unit" character varying(40) NOT NULL DEFAULT 'unit',
        "status" character varying(30) NOT NULL DEFAULT 'operational',
        "installed_at" date,
        "last_maintenance_at" date,
        "next_maintenance_at" date,
        "specifications" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_equipment_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_equipment_site_id" FOREIGN KEY ("site_id")
          REFERENCES "public"."sites"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."planifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "title" character varying(180) NOT NULL,
        "description" text,
        "maintenance_type" character varying(80),
        "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "duration_minutes" integer,
        "status" character varying(30) NOT NULL DEFAULT 'planned',
        "assigned_to" uuid,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_planifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_planifications_site_id" FOREIGN KEY ("site_id")
          REFERENCES "public"."sites"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_planifications_assigned_to" FOREIGN KEY ("assigned_to")
          REFERENCES "public"."app_users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_planifications_created_by" FOREIGN KEY ("created_by")
          REFERENCES "public"."app_users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."rapports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "site_id" uuid NOT NULL,
        "planification_id" uuid,
        "title" character varying(180) NOT NULL,
        "report_date" date NOT NULL DEFAULT CURRENT_DATE,
        "status" character varying(30) NOT NULL DEFAULT 'draft',
        "summary" text,
        "findings" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "actions_taken" text,
        "recommendations" text,
        "created_by" uuid,
        "validated_by" uuid,
        "validated_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rapports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rapports_site_id" FOREIGN KEY ("site_id")
          REFERENCES "public"."sites"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rapports_planification_id" FOREIGN KEY ("planification_id")
          REFERENCES "public"."planifications"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_rapports_created_by" FOREIGN KEY ("created_by")
          REFERENCES "public"."app_users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_rapports_validated_by" FOREIGN KEY ("validated_by")
          REFERENCES "public"."app_users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "sites_status_idx" ON "public"."sites" ("status")`);
    await queryRunner.query(`CREATE INDEX "sites_name_idx" ON "public"."sites" ("name")`);
    await queryRunner.query(`CREATE INDEX "equipment_site_id_idx" ON "public"."equipment" ("site_id")`);
    await queryRunner.query(`CREATE INDEX "equipment_status_idx" ON "public"."equipment" ("status")`);
    await queryRunner.query(`CREATE INDEX "equipment_next_maintenance_idx" ON "public"."equipment" ("next_maintenance_at")`);
    await queryRunner.query(`CREATE INDEX "planifications_site_id_idx" ON "public"."planifications" ("site_id")`);
    await queryRunner.query(`CREATE INDEX "planifications_scheduled_at_idx" ON "public"."planifications" ("scheduled_at")`);
    await queryRunner.query(`CREATE INDEX "planifications_status_idx" ON "public"."planifications" ("status")`);
    await queryRunner.query(`CREATE INDEX "rapports_site_id_idx" ON "public"."rapports" ("site_id")`);
    await queryRunner.query(`CREATE INDEX "rapports_report_date_idx" ON "public"."rapports" ("report_date")`);
    await queryRunner.query(`CREATE INDEX "rapports_status_idx" ON "public"."rapports" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "public"."rapports"`);
    await queryRunner.query(`DROP TABLE "public"."planifications"`);
    await queryRunner.query(`DROP TABLE "public"."equipment"`);
    await queryRunner.query(`DROP TABLE "public"."sites"`);
    await queryRunner.query(`DROP TABLE "public"."app_users"`);
  }
}
