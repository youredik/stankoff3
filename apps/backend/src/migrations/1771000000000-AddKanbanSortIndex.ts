import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKanbanSortIndex1771000000000 implements MigrationInterface {
  name = 'AddKanbanSortIndex1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_entities_kanban_sort"
      ON "entities" ("workspaceId", "status", "priority", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entities_kanban_sort"`);
  }
}
