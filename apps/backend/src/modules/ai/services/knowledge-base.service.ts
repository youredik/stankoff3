import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { KnowledgeChunk, ChunkSourceType } from '../entities/knowledge-chunk.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';

interface SimilarChunk {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  similarity: number;
  textRank?: number;
}

/**
 * Кэшированный embedding для повторных запросов
 */
interface CachedEmbedding {
  embedding: number[];
  provider: string;
  model: string;
  inputTokens: number;
  cachedAt: number;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  // Embedding cache: in-memory с TTL
  private readonly embeddingCache = new Map<string, CachedEmbedding>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут
  private readonly MAX_CACHE_SIZE = 200; // макс. количество записей

  constructor(
    private readonly providerRegistry: AiProviderRegistry,
    private readonly dataSource: DataSource,
    @InjectRepository(KnowledgeChunk)
    private readonly chunkRepo: Repository<KnowledgeChunk>,
    @InjectRepository(AiUsageLog)
    private readonly usageLogRepo: Repository<AiUsageLog>,
  ) {}

  /**
   * Проверяет доступность сервиса
   */
  isAvailable(): boolean {
    return this.providerRegistry.isEmbeddingAvailable();
  }

  /**
   * Добавляет текст в базу знаний
   */
  async addChunk(params: {
    content: string;
    sourceType: ChunkSourceType;
    sourceId?: string;
    workspaceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<KnowledgeChunk> {
    if (!this.isAvailable()) {
      throw new Error('AI сервис не настроен');
    }

    const startTime = Date.now();

    // Генерируем embedding через реестр провайдеров
    const embeddingResult = await this.providerRegistry.embed(params.content);

    // Логируем использование
    await this.logUsage({
      provider: embeddingResult.provider as AiUsageLog['provider'],
      model: embeddingResult.model,
      operation: 'embed',
      workspaceId: params.workspaceId,
      inputTokens: embeddingResult.inputTokens,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      success: true,
    });

    // Сохраняем чанк
    const chunk = this.chunkRepo.create({
      content: params.content,
      embedding: embeddingResult.embedding,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      workspaceId: params.workspaceId,
      metadata: params.metadata || {},
    });

    return this.chunkRepo.save(chunk);
  }

  /**
   * Удаляет чанки по source
   */
  async removeChunksBySource(
    sourceType: ChunkSourceType,
    sourceId: string,
  ): Promise<number> {
    const result = await this.chunkRepo.delete({
      sourceType,
      sourceId,
    });

    return result.affected || 0;
  }

  /**
   * Проверяет наличие чанков для набора sourceId (batch)
   * Возвращает Set с sourceId, для которых уже есть чанки
   */
  async getIndexedSourceIds(
    sourceType: ChunkSourceType,
    sourceIds: string[],
  ): Promise<Set<string>> {
    if (sourceIds.length === 0) return new Set();

    const rows = await this.chunkRepo
      .createQueryBuilder('chunk')
      .select('DISTINCT chunk.sourceId', 'sourceId')
      .where('chunk.sourceType = :sourceType', { sourceType })
      .andWhere('chunk.sourceId IN (:...sourceIds)', { sourceIds })
      .getRawMany<{ sourceId: string }>();

    return new Set(rows.map(r => r.sourceId));
  }

  /**
   * Ищет похожие чанки по тексту
   * Использует гибридный поиск (vector + full-text) когда доступен
   */
  async searchSimilar(params: {
    query: string;
    workspaceId?: string;
    sourceType?: ChunkSourceType;
    limit?: number;
    minSimilarity?: number;
    userId?: string;
  }): Promise<SimilarChunk[]> {
    if (!this.isAvailable()) {
      throw new Error('AI сервис не настроен');
    }

    const startTime = Date.now();
    const limit = params.limit || 10;
    const minSimilarity = params.minSimilarity || 0.7;

    // Проверяем embedding cache
    const cached = this.getCachedEmbedding(params.query);
    let embedding: number[];
    let provider: string;
    let model: string;
    let inputTokens: number;

    if (cached) {
      embedding = cached.embedding;
      provider = cached.provider;
      model = cached.model;
      inputTokens = cached.inputTokens;
      this.logger.debug(`Embedding cache hit для запроса (${params.query.slice(0, 50)}...)`);
    } else {
      // Генерируем embedding через реестр провайдеров
      const embeddingResult = await this.providerRegistry.embed(params.query);
      embedding = embeddingResult.embedding;
      provider = embeddingResult.provider;
      model = embeddingResult.model;
      inputTokens = embeddingResult.inputTokens;

      // Кэшируем результат
      this.cacheEmbedding(params.query, {
        embedding,
        provider,
        model,
        inputTokens,
        cachedAt: Date.now(),
      });

      // Логируем использование (только для некэшированных)
      await this.logUsage({
        provider: provider as AiUsageLog['provider'],
        model,
        operation: 'search',
        userId: params.userId,
        workspaceId: params.workspaceId,
        inputTokens,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        success: true,
      });
    }

    // Формируем vector строку для SQL
    const embeddingVector = `[${embedding.join(',')}]`;

    // Пробуем гибридный поиск
    try {
      const results = await this.dataSource.query<SimilarChunk[]>(
        `SELECT id, content, "sourceType", "sourceId", metadata, similarity, "textRank"
         FROM search_hybrid_chunks($1::vector, $2, $3, $4, $5, $6)`,
        [
          embeddingVector,
          params.query,
          params.workspaceId || null,
          params.sourceType || null,
          limit,
          minSimilarity,
        ],
      );
      return results;
    } catch {
      // Fallback на обычный vector search (если гибридная функция не существует)
      this.logger.debug('Hybrid search недоступен, используем vector search');
    }

    // Fallback: обычный vector search
    const results = await this.dataSource.query<SimilarChunk[]>(
      `SELECT * FROM search_similar_chunks($1::vector, $2, $3, $4, $5)`,
      [
        embeddingVector,
        params.workspaceId || null,
        params.sourceType || null,
        limit,
        minSimilarity,
      ],
    );

    return results;
  }

  /**
   * Получает статистику базы знаний
   */
  async getStats(workspaceId?: string): Promise<{
    totalChunks: number;
    bySourceType: Record<string, number>;
  }> {
    const queryBuilder = this.chunkRepo.createQueryBuilder('chunk');

    if (workspaceId) {
      queryBuilder.where('chunk.workspace_id = :workspaceId', { workspaceId });
    }

    const totalChunks = await queryBuilder.getCount();

    // Группировка по типу источника
    const bySourceRaw = await this.chunkRepo
      .createQueryBuilder('chunk')
      .select('chunk.source_type', 'sourceType')
      .addSelect('COUNT(*)', 'count')
      .where(workspaceId ? 'chunk.workspace_id = :workspaceId' : '1=1', {
        workspaceId,
      })
      .groupBy('chunk.source_type')
      .getRawMany();

    const bySourceType: Record<string, number> = {};
    for (const row of bySourceRaw) {
      bySourceType[row.sourceType] = parseInt(row.count, 10);
    }

    return { totalChunks, bySourceType };
  }

  /**
   * Получает статистику embedding cache
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttlMs: this.CACHE_TTL_MS,
    };
  }

  /**
   * Очищает embedding cache
   */
  clearEmbeddingCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Получает кэшированный embedding (с проверкой TTL)
   */
  private getCachedEmbedding(query: string): CachedEmbedding | null {
    const cached = this.embeddingCache.get(query);
    if (!cached) return null;

    if (Date.now() - cached.cachedAt > this.CACHE_TTL_MS) {
      this.embeddingCache.delete(query);
      return null;
    }

    return cached;
  }

  /**
   * Сохраняет embedding в кэш (с eviction по размеру)
   */
  private cacheEmbedding(query: string, entry: CachedEmbedding): void {
    // Eviction: если кэш полон, удаляем самую старую запись
    if (this.embeddingCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.embeddingCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.embeddingCache.delete(oldestKey);
      }
    }

    this.embeddingCache.set(query, entry);
  }

  /**
   * Логирует использование AI
   */
  private async logUsage(data: {
    provider: string;
    model: string;
    operation: string;
    userId?: string;
    workspaceId?: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      const log = this.usageLogRepo.create({
        provider: data.provider as AiUsageLog['provider'],
        model: data.model,
        operation: data.operation as AiUsageLog['operation'],
        userId: data.userId,
        workspaceId: data.workspaceId,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        latencyMs: data.latencyMs,
        success: data.success,
        error: data.error,
      });

      await this.usageLogRepo.save(log);
    } catch (e) {
      this.logger.error(`Ошибка записи лога: ${e}`);
    }
  }
}
