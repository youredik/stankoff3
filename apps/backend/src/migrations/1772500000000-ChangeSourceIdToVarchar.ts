import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Миграция: изменение source_id с UUID на VARCHAR(255)
 *
 * Причина: Legacy заявки имеют числовые ID (RID из QD_requests),
 * которые не являются валидными UUID. source_id должен быть varchar
 * для поддержки любых идентификаторов источников.
 */
export class ChangeSourceIdToVarchar1772500000000 implements MigrationInterface {
  name = 'ChangeSourceIdToVarchar1772500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Меняем тип колонки source_id с UUID на VARCHAR(255)
    await queryRunner.query(`
      ALTER TABLE knowledge_chunks
      ALTER COLUMN source_id TYPE VARCHAR(255)
    `);

    // 2. DROP старую функцию (нельзя изменить return type через CREATE OR REPLACE)
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS search_similar_chunks(vector, UUID, VARCHAR, INT, FLOAT)
    `);

    // 3. Создаём функцию с новым return type (source_id VARCHAR)
    await queryRunner.query(`
      CREATE FUNCTION search_similar_chunks(
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
        source_id VARCHAR(255),
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
    // Откат: удаляем данные с не-UUID source_id и возвращаем UUID тип
    await queryRunner.query(`
      DELETE FROM knowledge_chunks
      WHERE source_id IS NOT NULL
      AND source_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `);

    await queryRunner.query(`
      ALTER TABLE knowledge_chunks
      ALTER COLUMN source_id TYPE UUID USING source_id::UUID
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS search_similar_chunks(vector, UUID, VARCHAR, INT, FLOAT)
    `);

    await queryRunner.query(`
      CREATE FUNCTION search_similar_chunks(
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
}
