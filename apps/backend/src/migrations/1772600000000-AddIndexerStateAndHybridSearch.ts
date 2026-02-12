import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Миграция: Persistent indexing progress + Hybrid search (Vector + Full-Text)
 *
 * 1. indexer_state — таблица для сохранения прогресса индексации RAG
 *    (позволяет продолжить с места остановки после рестарта контейнера)
 *
 * 2. search_vector — tsvector колонка в knowledge_chunks для полнотекстового поиска
 *    + GIN индекс + триггер для автообновления
 *
 * 3. search_hybrid_chunks — функция гибридного поиска
 *    (комбинирует cosine similarity + ts_rank для лучшего ранжирования)
 */
export class AddIndexerStateAndHybridSearch1772600000000 implements MigrationInterface {
  name = 'AddIndexerStateAndHybridSearch1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Таблица для сохранения прогресса индексации
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "indexer_state" (
        "id" VARCHAR(100) PRIMARY KEY,
        "last_processed_offset" INT NOT NULL DEFAULT 0,
        "total_requests" INT NOT NULL DEFAULT 0,
        "processed_requests" INT NOT NULL DEFAULT 0,
        "skipped_requests" INT NOT NULL DEFAULT 0,
        "total_chunks" INT NOT NULL DEFAULT 0,
        "failed_requests" INT NOT NULL DEFAULT 0,
        "is_completed" BOOLEAN NOT NULL DEFAULT FALSE,
        "started_at" TIMESTAMPTZ,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Добавляем search_vector для полнотекстового поиска
    await queryRunner.query(`
      ALTER TABLE "knowledge_chunks"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    `);

    // 3. GIN индекс для быстрого полнотекстового поиска
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_search_vector"
      ON "knowledge_chunks" USING GIN ("search_vector")
    `);

    // 4. Триггерная функция для автообновления search_vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION knowledge_chunks_search_vector_update()
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := to_tsvector('russian', COALESCE(NEW.content, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // 5. Триггер: обновляет search_vector при INSERT или UPDATE content
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS knowledge_chunks_search_vector_trigger ON "knowledge_chunks"
    `);

    await queryRunner.query(`
      CREATE TRIGGER knowledge_chunks_search_vector_trigger
      BEFORE INSERT OR UPDATE OF content ON "knowledge_chunks"
      FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_search_vector_update()
    `);

    // 6. Backfill search_vector для существующих чанков
    // Может занять 10-30 секунд для 100K+ строк
    await queryRunner.query(`
      UPDATE "knowledge_chunks"
      SET search_vector = to_tsvector('russian', COALESCE(content, ''))
      WHERE search_vector IS NULL
    `);

    // 7. Функция гибридного поиска (Vector + Full-Text)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION search_hybrid_chunks(
        query_embedding vector(256),
        query_text TEXT,
        filter_workspace_id UUID DEFAULT NULL,
        filter_source_type VARCHAR(50) DEFAULT NULL,
        result_limit INT DEFAULT 10,
        min_similarity FLOAT DEFAULT 0.5
      )
      RETURNS TABLE (
        id UUID,
        content TEXT,
        "sourceType" VARCHAR(50),
        "sourceId" VARCHAR(255),
        metadata JSONB,
        similarity FLOAT,
        "textRank" FLOAT
      ) AS $$
      DECLARE
        ts_query tsquery;
      BEGIN
        ts_query := plainto_tsquery('russian', COALESCE(query_text, ''));

        RETURN QUERY
        SELECT
          kc.id,
          kc.content,
          kc.source_type,
          kc.source_id,
          kc.metadata,
          (
            (1 - (kc.embedding <=> query_embedding))
            + CASE
                WHEN ts_query != ''::tsquery AND kc.search_vector @@ ts_query
                THEN 0.2 * LEAST(ts_rank_cd(kc.search_vector, ts_query) * 5, 1.0)
                ELSE 0
              END
          )::FLOAT AS similarity,
          CASE
            WHEN ts_query != ''::tsquery
            THEN COALESCE(ts_rank_cd(kc.search_vector, ts_query), 0)::FLOAT
            ELSE 0::FLOAT
          END AS "textRank"
        FROM knowledge_chunks kc
        WHERE
          (filter_workspace_id IS NULL OR kc.workspace_id = filter_workspace_id)
          AND (filter_source_type IS NULL OR kc.source_type = filter_source_type)
          AND kc.embedding IS NOT NULL
          AND (
            (1 - (kc.embedding <=> query_embedding)) >= min_similarity
            OR (ts_query != ''::tsquery AND kc.search_vector @@ ts_query)
          )
        ORDER BY (
          (1 - (kc.embedding <=> query_embedding))
          + CASE
              WHEN ts_query != ''::tsquery AND kc.search_vector @@ ts_query
              THEN 0.2 * LEAST(ts_rank_cd(kc.search_vector, ts_query) * 5, 1.0)
              ELSE 0
            END
        ) DESC
        LIMIT result_limit;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS search_hybrid_chunks`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS knowledge_chunks_search_vector_trigger ON "knowledge_chunks"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS knowledge_chunks_search_vector_update`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_knowledge_chunks_search_vector"`);
    await queryRunner.query(`ALTER TABLE "knowledge_chunks" DROP COLUMN IF EXISTS "search_vector"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "indexer_state"`);
  }
}
