import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeArticles1771800000000 implements MigrationInterface {
  name = 'AddKnowledgeArticles1771800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "knowledge_articles" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" VARCHAR(500) NOT NULL,
        "content" TEXT,
        "type" VARCHAR(20) NOT NULL,
        "workspace_id" UUID,
        "category" VARCHAR(100),
        "tags" TEXT[] DEFAULT '{}',
        "file_key" VARCHAR(500),
        "file_name" VARCHAR(255),
        "file_size" INT,
        "file_mime_type" VARCHAR(100),
        "status" VARCHAR(20) NOT NULL DEFAULT 'published',
        "author_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_kb_articles_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_kb_articles_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // B-tree индексы
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_workspace" ON "knowledge_articles"("workspace_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_type" ON "knowledge_articles"("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_category" ON "knowledge_articles"("category")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_author" ON "knowledge_articles"("author_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_status" ON "knowledge_articles"("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_created" ON "knowledge_articles"("created_at" DESC)`);

    // GIN индекс для полнотекстового поиска по title
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_search" ON "knowledge_articles" USING GIN (to_tsvector('russian', "title"))`);

    // GIN индекс для массива tags
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_kb_articles_tags" ON "knowledge_articles" USING GIN ("tags")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_articles" CASCADE`);
  }
}
