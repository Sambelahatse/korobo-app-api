import type { MigrationInterface, QueryRunner } from "typeorm";
export class AddNativeAuth1792650000000 implements MigrationInterface {
  name = "AddNativeAuth1792650000000";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "public"."app_users" ADD COLUMN IF NOT EXISTS "password_hash" character varying(255)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "public"."auth_tokens" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "public"."app_users"("id") ON DELETE CASCADE, "token_hash" character varying(64) NOT NULL UNIQUE, "purpose" character varying(20) NOT NULL CHECK ("purpose" IN ('invite', 'password_reset')), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "auth_tokens_user_purpose_idx" ON "public"."auth_tokens" ("user_id", "purpose")`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."auth_tokens"`);
    await queryRunner.query(`ALTER TABLE "public"."app_users" DROP COLUMN IF EXISTS "password_hash"`);
  }
}
