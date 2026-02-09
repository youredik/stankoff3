import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessDefinitionVersions1771300000000
  implements MigrationInterface
{
  name = 'AddProcessDefinitionVersions1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS process_definition_versions (
        "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "processDefinitionId" UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
        "version" INT NOT NULL,
        "bpmnXml" TEXT NOT NULL,
        "deployedKey" VARCHAR,
        "deployedById" UUID REFERENCES users(id) ON DELETE SET NULL,
        "changelog" TEXT,
        "deployedAt" TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pdv_definition_version
      ON process_definition_versions ("processDefinitionId", "version")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_pdv_definition_version`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS process_definition_versions`,
    );
  }
}
