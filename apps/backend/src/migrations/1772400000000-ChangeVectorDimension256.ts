import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Миграция: изменение размерности vector с 1536 на 256
 *
 * Причина: переход на Yandex Cloud Embeddings (text-search-doc/latest, 256 dims нативно)
 * с предыдущего 1536-dim формата.
 *
 * Yandex Cloud Embeddings:
 * - Нет гео-блокировки
 * - 0 ГБ RAM на сервере
 * - Нативная поддержка русского языка
 * - 256 dims — достаточно для similarity search
 *
 * Действия:
 * 1. Удаляет HNSW индекс
 * 2. Удаляет старые knowledge_chunks (все были padded 768→1536, несовместимы)
 * 3. Меняет тип колонки embedding на vector(256)
 * 4. Пересоздаёт HNSW индекс
 * 5. Обновляет функцию search_similar_chunks
 */
export class ChangeVectorDimension2561772400000000 implements MigrationInterface {
  name = 'ChangeVectorDimension2561772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Удаляем HNSW индекс (нельзя менять тип колонки с индексом)
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_knowledge_chunks_embedding
    `);

    // 2. Удаляем старые chunks (несовместимы с новой размерностью)
    await queryRunner.query(`
      DELETE FROM knowledge_chunks
    `);

    // 3. Меняем размерность колонки embedding
    await queryRunner.query(`
      ALTER TABLE knowledge_chunks
      ALTER COLUMN embedding TYPE vector(256)
    `);

    // 4. Пересоздаём HNSW индекс для 256 dims
    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_embedding
        ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);

    // 5. Обновляем функцию поиска для 256 dims
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION search_similar_chunks(
        query_embedding vector(256),
        workspace_filter UUID DEFAULT NULL,
        source_filter VARCHAR(50) DEFAULT NULL,
        limit_count INT DEFAULT 10,
        min_similarity FLOAT DEFAULT 0.7
      )
      RETURNS TABLE (
        id UUID,
        content TEXT,
        source_type VARCHAR(50),
        source_id UUID,
        metadata JSONB,
        similarity FLOAT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          kc.id,
          kc.content,
          kc.source_type,
          kc.source_id,
          kc.metadata,
          (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
        FROM knowledge_chunks kc
        WHERE
          (workspace_filter IS NULL OR kc.workspace_id = workspace_filter)
          AND (source_filter IS NULL OR kc.source_type = source_filter)
          AND kc.embedding IS NOT NULL
          AND (1 - (kc.embedding <=> query_embedding)) >= min_similarity
        ORDER BY kc.embedding <=> query_embedding
        LIMIT limit_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Откат: возвращаем 1536
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_knowledge_chunks_embedding
    `);

    await queryRunner.query(`
      DELETE FROM knowledge_chunks
    `);

    await queryRunner.query(`
      ALTER TABLE knowledge_chunks
      ALTER COLUMN embedding TYPE vector(1536)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_embedding
        ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION search_similar_chunks(
        query_embedding vector(1536),
        workspace_filter UUID DEFAULT NULL,
        source_filter VARCHAR(50) DEFAULT NULL,
        limit_count INT DEFAULT 10,
        min_similarity FLOAT DEFAULT 0.7
      )
      RETURNS TABLE (
        id UUID,
        content TEXT,
        source_type VARCHAR(50),
        source_id UUID,
        metadata JSONB,
        similarity FLOAT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          kc.id,
          kc.content,
          kc.source_type,
          kc.source_id,
          kc.metadata,
          (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
        FROM knowledge_chunks kc
        WHERE
          (workspace_filter IS NULL OR kc.workspace_id = workspace_filter)
          AND (source_filter IS NULL OR kc.source_type = source_filter)
          AND kc.embedding IS NOT NULL
          AND (1 - (kc.embedding <=> query_embedding)) >= min_similarity
        ORDER BY kc.embedding <=> query_embedding
        LIMIT limit_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
