import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlanificationTimeRange1792713600000 implements MigrationInterface {
  name = "AddPlanificationTimeRange1792713600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."planifications"
      ADD COLUMN "start_time" time NOT NULL DEFAULT '09:00',
      ADD COLUMN "end_time" time NOT NULL DEFAULT '10:00'
    `);
    await queryRunner.query(`
      UPDATE "public"."planifications"
      SET "end_time" = ("start_time" + (COALESCE("duration_minutes", 60) * interval '1 minute'))::time
      WHERE "duration_minutes" > 0 AND "duration_minutes" < 900
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."planifications" DROP COLUMN "end_time", DROP COLUMN "start_time"`);
  }
}
