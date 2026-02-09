import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceIsInternal1770636569209 implements MigrationInterface {
  name = 'AddWorkspaceIsInternal1770636569209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "isInternal" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "workspaces" SET "isInternal" = true WHERE "prefix" = 'LEG'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "isInternal"`,
    );
  }
}
