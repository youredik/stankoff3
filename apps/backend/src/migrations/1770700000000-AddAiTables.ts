import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Миграция для AI модуля
 * - Включает расширение pgvector
 * - Создаёт таблицу knowledge_chunks для RAG
 * - Создаёт таблицу ai_usage_logs для мониторинга
 */
export class AddAiTables1770700000000 implements MigrationInterface {
  name = 'AddAiTables1770700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================== pgvector extension =====================
    // Требует установки расширения в PostgreSQL
    // На managed PostgreSQL может потребоваться включить через консоль
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS vector
    `);

    // ===================== knowledge_chunks =====================
    // Хранит чанки для RAG поиска
    await queryRunner.query(`
      CREATE TABLE knowledge_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        embedding vector(1536),
        source_type VARCHAR(50) NOT NULL,
        source_id UUID,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // HNSW индекс для быстрого поиска по косинусному расстоянию
    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_embedding
        ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);

    // Индексы для фильтрации
    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_workspace
        ON knowledge_chunks(workspace_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_source
        ON knowledge_chunks(source_type, source_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_knowledge_chunks_created
        ON knowledge_chunks(created_at DESC)
    `);

    // ===================== ai_usage_logs =====================
    // Логирование использования AI для мониторинга и биллинга
    await queryRunner.query(`
      CREATE TABLE ai_usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
        entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
        input_tokens INT DEFAULT 0,
        output_tokens INT DEFAULT 0,
        latency_ms INT DEFAULT 0,
        success BOOLEAN DEFAULT true,
        error TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Индексы для аналитики
    await queryRunner.query(`
      CREATE INDEX idx_ai_usage_logs_created
        ON ai_usage_logs(created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ai_usage_logs_provider
        ON ai_usage_logs(provider, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ai_usage_logs_user
        ON ai_usage_logs(user_id, created_at DESC)
        WHERE user_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ai_usage_logs_workspace
        ON ai_usage_logs(workspace_id, created_at DESC)
        WHERE workspace_id IS NOT NULL
    `);

    // ===================== ai_classifications =====================
    // Кэш классификаций для entities
    await queryRunner.query(`
      CREATE TABLE ai_classifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        category VARCHAR(100),
        priority VARCHAR(50),
        skills JSONB DEFAULT '[]',
        confidence DECIMAL(3,2) DEFAULT 0,
        reasoning TEXT,
        provider VARCHAR(50),
        model VARCHAR(100),
        applied BOOLEAN DEFAULT false,
        applied_at TIMESTAMPTZ,
        applied_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(entity_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ai_classifications_entity
        ON ai_classifications(entity_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ai_classifications_category
        ON ai_classifications(category)
        WHERE category IS NOT NULL
    `);

    // ===================== Функция поиска похожих =====================
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Удаляем функцию
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS search_similar_chunks
    `);

    // Удаляем таблицы
    await queryRunner.query(`DROP TABLE IF EXISTS ai_classifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_usage_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS knowledge_chunks`);

    // Не удаляем расширение vector, т.к. оно может использоваться другими
  }
}
