import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemWorkspaceColumns1772800000000 implements MigrationInterface {
  name = 'AddSystemWorkspaceColumns1772800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspaces"
      ADD COLUMN IF NOT EXISTS "systemType" varchar(30) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "workspaces"
      ADD COLUMN IF NOT EXISTS "isSystem" boolean NOT NULL DEFAULT false
    `);

    // Только один workspace на каждый systemType
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_workspaces_system_type"
      ON "workspaces" ("systemType") WHERE "systemType" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_workspaces_system_type"`);
    await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "isSystem"`);
    await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "systemType"`);
  }
}
