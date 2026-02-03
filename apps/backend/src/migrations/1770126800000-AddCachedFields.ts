import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add cached fields for analytics.
 *
 * Adds fields: commentCount, lastActivityAt, firstResponseAt, resolvedAt
 * Creates triggers to automatically update these fields.
 */
export class AddCachedFields1770126800000 implements MigrationInterface {
  name = 'AddCachedFields1770126800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // Добавляем новые колонки
    // ============================================

    await queryRunner.query(`
      ALTER TABLE "entities"
      ADD COLUMN "commentCount" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "entities"
      ADD COLUMN "lastActivityAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "entities"
      ADD COLUMN "firstResponseAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "entities"
      ADD COLUMN "resolvedAt" TIMESTAMP WITH TIME ZONE
    `);

    // ============================================
    // Индексы для быстрой сортировки по активности
    // ============================================

    await queryRunner.query(`
      CREATE INDEX "idx_entities_last_activity"
      ON "entities" ("workspaceId", "lastActivityAt" DESC NULLS LAST)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_entities_resolved"
      ON "entities" ("workspaceId", "resolvedAt")
      WHERE "resolvedAt" IS NOT NULL
    `);

    // ============================================
    // Триггер: обновление commentCount при создании/удалении комментария
    // ============================================

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_entity_comment_count() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          UPDATE "entities" SET
            "commentCount" = "commentCount" + 1,
            "lastActivityAt" = NOW()
          WHERE id = NEW."entityId";

          -- Первый ответ: если это не автор заявки
          UPDATE "entities" SET
            "firstResponseAt" = NOW()
          WHERE id = NEW."entityId"
            AND "firstResponseAt" IS NULL
            AND "assigneeId" IS DISTINCT FROM NEW."authorId";

          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE "entities" SET
            "commentCount" = GREATEST(0, "commentCount" - 1)
          WHERE id = OLD."entityId";
          RETURN OLD;
        END IF;
        RETURN NULL;
      END
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_update_entity_comment_count
        AFTER INSERT OR DELETE ON "comments"
        FOR EACH ROW EXECUTE FUNCTION update_entity_comment_count()
    `);

    // ============================================
    // Триггер: обновление lastActivityAt при изменении заявки
    // ============================================

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_entity_last_activity() RETURNS trigger AS $$
      BEGIN
        NEW."lastActivityAt" = NOW();
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_update_entity_last_activity
        BEFORE UPDATE ON "entities"
        FOR EACH ROW
        WHEN (OLD.* IS DISTINCT FROM NEW.*)
        EXECUTE FUNCTION update_entity_last_activity()
    `);

    // ============================================
    // Заполняем существующие данные
    // ============================================

    // Обновляем commentCount
    await queryRunner.query(`
      UPDATE "entities" e SET
        "commentCount" = (
          SELECT COUNT(*) FROM "comments" c WHERE c."entityId" = e.id
        )
    `);

    // Устанавливаем lastActivityAt = max(updatedAt, последний комментарий)
    await queryRunner.query(`
      UPDATE "entities" e SET
        "lastActivityAt" = GREATEST(
          e."updatedAt",
          (SELECT MAX(c."createdAt") FROM "comments" c WHERE c."entityId" = e.id)
        )
    `);

    // Устанавливаем firstResponseAt (первый комментарий не от автора)
    await queryRunner.query(`
      UPDATE "entities" e SET
        "firstResponseAt" = (
          SELECT MIN(c."createdAt")
          FROM "comments" c
          WHERE c."entityId" = e.id
            AND c."authorId" IS DISTINCT FROM e."assigneeId"
        )
      WHERE e."assigneeId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаляем триггеры
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_update_entity_last_activity ON "entities"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_entity_last_activity()`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_update_entity_comment_count ON "comments"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_entity_comment_count()`);

    // Удаляем индексы
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_resolved"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_entities_last_activity"`);

    // Удаляем колонки
    await queryRunner.query(`ALTER TABLE "entities" DROP COLUMN IF EXISTS "resolvedAt"`);
    await queryRunner.query(`ALTER TABLE "entities" DROP COLUMN IF EXISTS "firstResponseAt"`);
    await queryRunner.query(`ALTER TABLE "entities" DROP COLUMN IF EXISTS "lastActivityAt"`);
    await queryRunner.query(`ALTER TABLE "entities" DROP COLUMN IF EXISTS "commentCount"`);
  }
}
