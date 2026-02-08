import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegacyMigrationLog1770900000000 implements MigrationInterface {
  name = 'AddLegacyMigrationLog1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legacy_migration_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "legacyRequestId" int NOT NULL,
        "entityId" uuid NOT NULL,
        "commentsCount" int NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'completed',
        "errorMessage" text,
        "migratedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_legacy_migration_log" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_legacy_migration_request" UNIQUE ("legacyRequestId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_legacy_migration_request"
      ON "legacy_migration_log" ("legacyRequestId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_legacy_migration_status"
      ON "legacy_migration_log" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_legacy_migration_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_legacy_migration_request"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "legacy_migration_log"`);
  }
}
