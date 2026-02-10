import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEntityLinkProcessInstanceId1771400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "entity_links"
      ADD COLUMN IF NOT EXISTS "processInstanceId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "entity_links"
      DROP COLUMN IF EXISTS "processInstanceId"
    `);
  }
}
