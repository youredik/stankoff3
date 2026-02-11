import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGinIndexOnEntityData1771900000000 implements MigrationInterface {
  name = 'AddGinIndexOnEntityData1771900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_entities_data_gin"
      ON "entities" USING GIN ("data" jsonb_path_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entities_data_gin"`);
  }
}
