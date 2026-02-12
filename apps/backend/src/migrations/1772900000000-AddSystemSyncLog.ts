import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemSyncLog1772900000000 implements MigrationInterface {
  name = 'AddSystemSyncLog1772900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_sync_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "systemType" varchar(30) NOT NULL,
        "legacyId" int NOT NULL,
        "entityId" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'completed',
        "errorMessage" text,
        "syncedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_system_sync_log" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_system_sync_type_legacy" UNIQUE ("systemType", "legacyId"),
        CONSTRAINT "FK_system_sync_entity" FOREIGN KEY ("entityId")
          REFERENCES "entities"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_system_sync_type"
      ON "system_sync_log" ("systemType")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_system_sync_entity"
      ON "system_sync_log" ("entityId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_system_sync_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_system_sync_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_sync_log"`);
  }
}
