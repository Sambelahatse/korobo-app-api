import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrganizations20261023090000 implements MigrationInterface {
  name = "AddOrganizations20261023090000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "public"."organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(180) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations_id" PRIMARY KEY ("id")
      )
    `);

    // Keep existing installations usable: pre-migration records are assigned to one legacy tenant.
    await queryRunner.query(`
      INSERT INTO "public"."organizations" ("id", "name")
      VALUES (gen_random_uuid(), 'KOROBO - données existantes')
      RETURNING "id"
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."app_users" ADD COLUMN "organization_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."sites" ADD COLUMN "organization_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "public"."app_users"
      SET "organization_id" = (SELECT "id" FROM "public"."organizations" WHERE "name" = 'KOROBO - données existantes' ORDER BY "created_at" DESC LIMIT 1)
      WHERE "organization_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "public"."sites"
      SET "organization_id" = (SELECT "id" FROM "public"."organizations" WHERE "name" = 'KOROBO - données existantes' ORDER BY "created_at" DESC LIMIT 1)
      WHERE "organization_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."app_users"
        ALTER COLUMN "organization_id" SET NOT NULL,
        ADD CONSTRAINT "FK_app_users_organization" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."sites"
        ALTER COLUMN "organization_id" SET NOT NULL,
        ADD CONSTRAINT "FK_sites_organization" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`ALTER TABLE "public"."equipment" ADD COLUMN "organization_id" uuid`);
    await queryRunner.query(`
      UPDATE "public"."equipment" AS equipment
      SET "organization_id" = site."organization_id"
      FROM "public"."sites" AS site
      WHERE equipment."site_id" = site."id" AND equipment."organization_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "public"."equipment"
        ALTER COLUMN "organization_id" SET NOT NULL,
        ADD CONSTRAINT "FK_equipment_organization" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "equipment_organization_id_idx" ON "public"."equipment" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "app_users_organization_id_idx" ON "public"."app_users" ("organization_id")`);
    await queryRunner.query(`CREATE INDEX "sites_organization_id_idx" ON "public"."sites" ("organization_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."equipment_organization_id_idx"`);
    await queryRunner.query(`ALTER TABLE "public"."equipment" DROP CONSTRAINT IF EXISTS "FK_equipment_organization", DROP COLUMN IF EXISTS "organization_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."sites_organization_id_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."app_users_organization_id_idx"`);
    await queryRunner.query(`ALTER TABLE "public"."sites" DROP CONSTRAINT IF EXISTS "FK_sites_organization", DROP COLUMN IF EXISTS "organization_id"`);
    await queryRunner.query(`ALTER TABLE "public"."app_users" DROP CONSTRAINT IF EXISTS "FK_app_users_organization", DROP COLUMN IF EXISTS "organization_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."organizations"`);
  }
}
