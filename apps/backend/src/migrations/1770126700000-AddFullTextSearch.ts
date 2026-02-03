import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Full-Text Search (FTS) support for Russian language.
 *
 * Adds tsvector columns and triggers for automatic search vector updates.
 * Uses weighted search: title/customId (A), data fields (B), comments (default).
 */
export class AddFullTextSearch1770126700000 implements MigrationInterface {
  name = 'AddFullTextSearch1770126700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // ENTITIES: Full-Text Search
    // ============================================

    // Add search_vector column to entities
    await queryRunner.query(`
      ALTER TABLE "entities" ADD COLUMN "searchVector" tsvector
    `);

    // Create GIN index for fast search
    await queryRunner.query(`
      CREATE INDEX "idx_entities_search" ON "entities" USING GIN ("searchVector")
    `);

    // Create trigger function for entities search vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION entities_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW."searchVector" :=
          setweight(to_tsvector('russian', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('russian', COALESCE(NEW."customId", '')), 'A') ||
          setweight(to_tsvector('russian', COALESCE(NEW.status, '')), 'B') ||
          setweight(to_tsvector('russian', COALESCE(NEW.priority, '')), 'B') ||
          setweight(to_tsvector('russian', COALESCE(NEW.data::text, '')), 'C');
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);

    // Create trigger for entities
    await queryRunner.query(`
      CREATE TRIGGER entities_search_vector_trigger
        BEFORE INSERT OR UPDATE ON "entities"
        FOR EACH ROW EXECUTE FUNCTION entities_search_vector_update()
    `);

    // Update existing entities to populate search_vector
    await queryRunner.query(`
      UPDATE "entities" SET "searchVector" =
        setweight(to_tsvector('russian', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('russian', COALESCE("customId", '')), 'A') ||
        setweight(to_tsvector('russian', COALESCE(status, '')), 'B') ||
        setweight(to_tsvector('russian', COALESCE(priority, '')), 'B') ||
        setweight(to_tsvector('russian', COALESCE(data::text, '')), 'C')
    `);

    // ============================================
    // COMMENTS: Full-Text Search
    // ============================================

    // Add search_vector column to comments
    await queryRunner.query(`
      ALTER TABLE "comments" ADD COLUMN "searchVector" tsvector
    `);

    // Create GIN index for fast search
    await queryRunner.query(`
      CREATE INDEX "idx_comments_search" ON "comments" USING GIN ("searchVector")
    `);

    // Create trigger function for comments search vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION comments_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW."searchVector" := to_tsvector('russian', COALESCE(NEW.content, ''));
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);

    // Create trigger for comments
    await queryRunner.query(`
      CREATE TRIGGER comments_search_vector_trigger
        BEFORE INSERT OR UPDATE ON "comments"
        FOR EACH ROW EXECUTE FUNCTION comments_search_vector_update()
    `);

    // Update existing comments to populate search_vector
    await queryRunner.query(`
      UPDATE "comments" SET "searchVector" = to_tsvector('russian', COALESCE(content, ''))
    `);

    // ============================================
    // AUDIT_LOGS: Add index for description search
    // ============================================

    // B-tree index on description field inside JSONB
    await queryRunner.query(`
      CREATE INDEX "idx_audit_description" ON "audit_logs" ((details->>'description'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop audit_logs index
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_audit_description"`);

    // Drop comments FTS
    await queryRunner.query(`DROP TRIGGER IF EXISTS comments_search_vector_trigger ON "comments"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS comments_search_vector_update()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_comments_search"`);
    await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN IF EXISTS "searchVector"`);

    // Drop entities FTS
    await queryRunner.query(`DROP TRIGGER IF EXISTS entities_search_vector_trigger ON "entities"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS entities_search_vector_update()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_search"`);
    await queryRunner.query(`ALTER TABLE "entities" DROP COLUMN IF EXISTS "searchVector"`);
  }
}
