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
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

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
   * Ищет похожие чанки по тексту
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

    // Генерируем embedding для запроса через реестр провайдеров
    const embeddingResult = await this.providerRegistry.embed(params.query);

    // Логируем использование
    await this.logUsage({
      provider: embeddingResult.provider as AiUsageLog['provider'],
      model: embeddingResult.model,
      operation: 'search',
      userId: params.userId,
      workspaceId: params.workspaceId,
      inputTokens: embeddingResult.inputTokens,
      outputTokens: 0,
      latencyMs: Date.now() - startTime,
      success: true,
    });

    // Используем функцию поиска из БД
    const embeddingVector = `[${embeddingResult.embedding.join(',')}]`;

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
