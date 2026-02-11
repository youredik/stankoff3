import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { ClassifierService } from './services/classifier.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { RagIndexerService, IndexingStats } from './services/rag-indexer.service';
import { AiAssistantService } from './services/ai-assistant.service';
import { AiUsageService, UsageStatsDto } from './services/ai-usage.service';
import { LegacyUrlService } from '../legacy/services/legacy-url.service';
import {
  ClassifyRequestDto,
  ClassifyResponseDto,
  SearchRequestDto,
  SearchResultDto,
  SearchResultItem,
  SuggestedExpert,
  ApplyClassificationDto,
  AiAssistantResponse,
  GeneratedResponseDto,
} from './dto/ai.dto';
import { AiClassification } from './entities/ai-classification.entity';

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly ragIndexerService: RagIndexerService,
    private readonly aiAssistantService: AiAssistantService,
    private readonly aiUsageService: AiUsageService,
    private readonly legacyUrlService: LegacyUrlService,
  ) {}

  /**
   * Проверка статуса AI сервиса
   *
   * GET /api/ai/health
   */
  @Get('health')
  getHealth(): {
    available: boolean;
    providers: { openai: boolean };
  } {
    return {
      available: this.classifierService.isAvailable(),
      providers: {
        openai: this.classifierService.isAvailable(),
      },
    };
  }

  /**
   * Классификация заявки
   *
   * POST /api/ai/classify
   */
  @Post('classify')
  async classify(
    @Body() dto: ClassifyRequestDto,
    @CurrentUser() user: User,
  ): Promise<ClassifyResponseDto> {
    if (!this.classifierService.isAvailable()) {
      throw new HttpException(
        'AI сервис не настроен. Добавьте OPENAI_API_KEY в переменные окружения.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      return await this.classifierService.classify(dto, user?.id);
    } catch (error) {
      this.logger.error(`Ошибка классификации: ${error}`);
      throw new HttpException(
        'Ошибка классификации заявки',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Классификация и сохранение для entity
   *
   * POST /api/ai/classify/:entityId
   */
  @Post('classify/:entityId')
  async classifyAndSave(
    @Param('entityId') entityId: string,
    @Body() dto: ClassifyRequestDto,
    @CurrentUser() user: User,
  ): Promise<AiClassification> {
    if (!this.classifierService.isAvailable()) {
      throw new HttpException(
        'AI сервис не настроен',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      return await this.classifierService.classifyAndSave(entityId, dto, user?.id);
    } catch (error) {
      this.logger.error(`Ошибка классификации entity ${entityId}: ${error}`);
      throw new HttpException(
        'Ошибка классификации заявки',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Получить сохранённую классификацию
   *
   * GET /api/ai/classification/:entityId
   */
  @Get('classification/:entityId')
  async getClassification(
    @Param('entityId') entityId: string,
  ): Promise<AiClassification | null> {
    try {
      return await this.classifierService.getClassification(entityId);
    } catch (error) {
      this.logger.error(`Ошибка получения классификации для ${entityId}: ${error}`);
      throw new HttpException(
        'Ошибка получения классификации',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Применить классификацию к entity
   *
   * POST /api/ai/classification/:entityId/apply
   */
  @Post('classification/:entityId/apply')
  async applyClassification(
    @Param('entityId') entityId: string,
    @CurrentUser() user: User,
  ): Promise<AiClassification | null> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    const result = await this.classifierService.applyClassification(
      entityId,
      user.id,
    );

    if (!result) {
      throw new HttpException(
        'Классификация не найдена',
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  /**
   * RAG поиск по базе знаний
   *
   * POST /api/ai/search
   *
   * Результаты включают ссылки на legacy систему (https://www.stankoff.ru)
   * для источников типа 'legacy_request'.
   */
  @Post('search')
  async search(
    @Body() dto: SearchRequestDto,
    @CurrentUser() user: User,
  ): Promise<SearchResultDto> {
    if (!this.knowledgeBaseService.isAvailable()) {
      throw new HttpException(
        'AI сервис не настроен',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const rawResults = await this.knowledgeBaseService.searchSimilar({
        query: dto.query,
        workspaceId: dto.workspaceId,
        sourceType: dto.sourceType as 'entity' | 'comment' | 'document' | 'faq' | 'legacy_request',
        limit: dto.limit,
        minSimilarity: dto.minSimilarity,
        userId: user?.id,
      });

      // Добавляем legacy ссылки к результатам
      const results: SearchResultItem[] = rawResults.map(item => ({
        ...item,
        legacyUrl: item.sourceType === 'legacy_request' && item.metadata?.legacyUrl
          ? String(item.metadata.legacyUrl)
          : item.sourceType === 'legacy_request'
            ? this.legacyUrlService.getRequestUrl(parseInt(item.sourceId, 10))
            : undefined,
      }));

      // Создаём контекст со ссылками для AI
      const { links: relatedLinks } = this.legacyUrlService.createAIContext(results);

      // Агрегируем экспертов из результатов поиска
      const suggestedExperts = this.extractExpertsFromResults(results);

      return {
        results,
        relatedLinks: relatedLinks.length > 0 ? relatedLinks : undefined,
        suggestedExperts: suggestedExperts.length > 0 ? suggestedExperts : undefined,
      };
    } catch (error) {
      this.logger.error(`Ошибка поиска: ${error}`);
      throw new HttpException(
        'Ошибка поиска',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Статистика базы знаний
   *
   * GET /api/ai/knowledge-base/stats
   */
  @Get('knowledge-base/stats')
  async getKnowledgeBaseStats(
    @Query('workspaceId') workspaceId?: string,
  ): Promise<{
    totalChunks: number;
    bySourceType: Record<string, number>;
  }> {
    return this.knowledgeBaseService.getStats(workspaceId);
  }

  // ==================== RAG INDEXING ====================

  /**
   * Проверка статуса RAG индексатора
   *
   * GET /api/ai/indexer/health
   */
  @Get('indexer/health')
  getIndexerHealth(): {
    available: boolean;
    services: { openai: boolean; legacy: boolean };
  } {
    const isAvailable = this.ragIndexerService.isAvailable();
    return {
      available: isAvailable,
      services: {
        openai: this.knowledgeBaseService.isAvailable(),
        legacy: isAvailable, // RAG indexer checks both
      },
    };
  }

  /**
   * Получить текущий статус индексации
   *
   * GET /api/ai/indexer/status
   */
  @Get('indexer/status')
  getIndexerStatus(): IndexingStats | { status: 'idle' } {
    const status = this.ragIndexerService.getStatus();
    return status || { status: 'idle' };
  }

  /**
   * Получить статистику индексации
   *
   * GET /api/ai/indexer/stats
   */
  @Get('indexer/stats')
  async getIndexerStats(): Promise<{
    legacy: {
      totalRequests: number;
      closedRequests: number;
      totalAnswers: number;
      averageAnswersPerRequest: number;
    };
    knowledgeBase: {
      totalChunks: number;
      bySourceType: Record<string, number>;
    };
    coverage: {
      indexedRequests: number;
      percentage: number;
    };
  }> {
    if (!this.ragIndexerService.isAvailable()) {
      throw new HttpException(
        'RAG Indexer недоступен: проверьте настройки OpenAI и Legacy DB',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.ragIndexerService.getIndexingStatistics();
  }

  /**
   * Запустить полную индексацию legacy данных
   *
   * POST /api/ai/indexer/start
   */
  @Post('indexer/start')
  async startIndexing(
    @Body() options: { batchSize?: number; maxRequests?: number },
    @CurrentUser() user: User,
  ): Promise<{ message: string; status: IndexingStats }> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    if (!this.ragIndexerService.isAvailable()) {
      throw new HttpException(
        'RAG Indexer недоступен: проверьте настройки OpenAI и Legacy DB',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(`Запуск индексации пользователем ${user.email}`);

    try {
      // Запускаем индексацию асинхронно
      const statsPromise = this.ragIndexerService.indexAll({
        batchSize: options.batchSize || 50,
        maxRequests: options.maxRequests,
      });

      // Возвращаем начальный статус сразу
      const initialStatus = this.ragIndexerService.getStatus();

      // Не ждём завершения, но логируем результат
      statsPromise
        .then(stats => {
          this.logger.log(
            `Индексация завершена: ${stats.processedRequests} заявок, ` +
            `${stats.totalChunks} чанков, ${stats.failedRequests} ошибок`
          );
        })
        .catch(error => {
          this.logger.error(`Ошибка индексации: ${error.message}`);
        });

      return {
        message: 'Индексация запущена',
        status: initialStatus!,
      };
    } catch (error) {
      this.logger.error(`Ошибка запуска индексации: ${error.message}`);
      throw new HttpException(
        error.message || 'Ошибка запуска индексации',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Переиндексировать конкретную заявку
   *
   * POST /api/ai/indexer/reindex/:requestId
   */
  @Post('indexer/reindex/:requestId')
  async reindexRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: User,
  ): Promise<{
    requestId: number;
    chunksCreated: number;
    success: boolean;
    error?: string;
  }> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    if (!this.ragIndexerService.isAvailable()) {
      throw new HttpException(
        'RAG Indexer недоступен',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const id = parseInt(requestId, 10);
    if (isNaN(id)) {
      throw new HttpException('Некорректный ID заявки', HttpStatus.BAD_REQUEST);
    }

    return this.ragIndexerService.reindexRequest(id);
  }

  // ==================== AI ASSISTANT ====================

  /**
   * Получить AI помощь для entity
   *
   * GET /api/ai/assist/:entityId
   *
   * Возвращает:
   * - Похожие решённые случаи
   * - Рекомендуемых экспертов
   * - Связанный контекст (контрагенты, сделки)
   * - Рекомендуемые действия
   */
  @Get('assist/:entityId')
  async getAssistance(
    @Param('entityId') entityId: string,
    @CurrentUser() user: User,
  ): Promise<AiAssistantResponse> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    return this.aiAssistantService.getAssistance(entityId);
  }

  /**
   * Сгенерировать черновик ответа для entity
   *
   * POST /api/ai/assist/:entityId/suggest-response
   *
   * Использует RAG для поиска похожих решённых случаев и
   * генерирует черновик ответа на основе контекста.
   */
  @Post('assist/:entityId/suggest-response')
  async suggestResponse(
    @Param('entityId') entityId: string,
    @Body() body: { additionalContext?: string },
    @CurrentUser() user: User,
  ): Promise<GeneratedResponseDto> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    try {
      return await this.aiAssistantService.generateResponseSuggestion(
        entityId,
        body.additionalContext,
      );
    } catch (error) {
      this.logger.error(`Ошибка генерации ответа: ${error.message}`);
      throw new HttpException(
        error.message || 'Ошибка генерации ответа',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Получить AI-резюме переписки по entity
   *
   * GET /api/ai/assist/:entityId/summary
   */
  @Get('assist/:entityId/summary')
  async getConversationSummary(
    @Param('entityId') entityId: string,
    @CurrentUser() user: User,
  ): Promise<{ summary: string; commentCount: number }> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    try {
      return await this.aiAssistantService.summarizeConversation(entityId);
    } catch (error) {
      if (error.message?.includes('Недостаточно комментариев')) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      this.logger.error(`Ошибка генерации резюме: ${error.message}`);
      throw new HttpException(
        error.message || 'Ошибка генерации резюме',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Streaming генерация черновика ответа (SSE)
   *
   * POST /api/ai/assist/:entityId/suggest-response/stream
   *
   * Возвращает Server-Sent Events:
   * - data: {"type":"chunk","text":"..."} — фрагмент текста
   * - data: {"type":"done","sources":[...]} — завершение с источниками
   */
  @Post('assist/:entityId/suggest-response/stream')
  async suggestResponseStream(
    @Param('entityId') entityId: string,
    @Body() body: { additionalContext?: string },
    @Res() res: Response,
    @CurrentUser() user: User,
  ): Promise<void> {
    if (!user?.id) {
      res.status(401).json({ message: 'Требуется авторизация' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = this.aiAssistantService.generateResponseSuggestionStream(
        entityId,
        body.additionalContext,
      );

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      this.logger.error(`Ошибка streaming генерации: ${error.message}`);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    }

    res.end();
  }

  // ==================== USAGE STATS ====================

  /**
   * Получить статистику использования AI за последние 30 дней
   *
   * GET /api/ai/usage/stats
   */
  @Get('usage/stats')
  async getUsageStats(
    @Query('days') days?: string,
    @Query('provider') provider?: string,
    @Query('operation') operation?: string,
    @CurrentUser() user?: User,
  ): Promise<UsageStatsDto> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    const numDays = days ? parseInt(days, 10) : 30;
    if (isNaN(numDays) || numDays < 1 || numDays > 365) {
      throw new HttpException('Параметр days должен быть от 1 до 365', HttpStatus.BAD_REQUEST);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    startDate.setHours(0, 0, 0, 0);

    return this.aiUsageService.getUsageStats({
      startDate,
      provider: provider as 'openai' | 'ollama' | 'groq' | undefined,
      operation: operation as 'classify' | 'generate' | 'embed' | 'search' | undefined,
    });
  }

  /**
   * Получить последние логи использования AI
   *
   * GET /api/ai/usage/logs
   */
  @Get('usage/logs')
  async getRecentLogs(
    @Query('limit') limit?: string,
    @Query('provider') provider?: string,
    @Query('operation') operation?: string,
    @CurrentUser() user?: User,
  ): Promise<Array<{
    id: string;
    provider: string;
    model: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
    error?: string;
    createdAt: Date;
    userName?: string;
  }>> {
    if (!user?.id) {
      throw new HttpException('Требуется авторизация', HttpStatus.UNAUTHORIZED);
    }

    const numLimit = limit ? parseInt(limit, 10) : 50;
    if (isNaN(numLimit) || numLimit < 1 || numLimit > 200) {
      throw new HttpException('Параметр limit должен быть от 1 до 200', HttpStatus.BAD_REQUEST);
    }

    const logs = await this.aiUsageService.getRecentLogs(numLimit, {
      provider: provider as 'openai' | 'ollama' | 'groq' | undefined,
      operation: operation as 'classify' | 'generate' | 'embed' | 'search' | undefined,
    });

    return logs.map(log => ({
      id: log.id,
      provider: log.provider,
      model: log.model,
      operation: log.operation,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      latencyMs: log.latencyMs,
      success: log.success,
      error: log.error || undefined,
      createdAt: log.createdAt,
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : undefined,
    }));
  }

  /**
   * Извлечь и агрегировать экспертов из результатов поиска
   * Сортирует по количеству релевантных случаев
   */
  private extractExpertsFromResults(results: SearchResultItem[]): SuggestedExpert[] {
    const expertsMap = new Map<string, {
      name: string;
      managerId?: number;
      department?: string;
      cases: Set<number>;
      topics: Set<string>;
    }>();

    for (const result of results) {
      if (result.sourceType !== 'legacy_request') {
        continue;
      }

      const metadata = result.metadata || {};
      const requestId = metadata.requestId as number;
      const subject = metadata.subject as string;

      // Обрабатываем менеджера
      if (metadata.managerName) {
        const name = String(metadata.managerName);
        const existing = expertsMap.get(name) || {
          name,
          managerId: metadata.managerId as number | undefined,
          department: metadata.managerDepartment as string | undefined,
          cases: new Set(),
          topics: new Set(),
        };
        if (requestId) existing.cases.add(requestId);
        if (subject) existing.topics.add(subject);
        expertsMap.set(name, existing);
      }

      // Обрабатываем специалистов из ответов
      const specialistNames = metadata.specialistNames as string[] | undefined;
      const specialists = metadata.specialists as Array<{ id: number; name: string }> | undefined;

      if (specialists && Array.isArray(specialists)) {
        for (const specialist of specialists) {
          const name = specialist.name;
          const existing = expertsMap.get(name) || {
            name,
            managerId: specialist.id,
            cases: new Set(),
            topics: new Set(),
          };
          if (requestId) existing.cases.add(requestId);
          if (subject) existing.topics.add(subject);
          expertsMap.set(name, existing);
        }
      } else if (specialistNames && Array.isArray(specialistNames)) {
        // Fallback to just names
        for (const name of specialistNames) {
          const existing = expertsMap.get(name) || {
            name,
            cases: new Set(),
            topics: new Set(),
          };
          if (requestId) existing.cases.add(requestId);
          if (subject) existing.topics.add(subject);
          expertsMap.set(name, existing);
        }
      }
    }

    // Преобразуем в массив и сортируем по количеству случаев
    return Array.from(expertsMap.values())
      .map(expert => ({
        name: expert.name,
        managerId: expert.managerId,
        department: expert.department,
        relevantCases: expert.cases.size,
        topics: Array.from(expert.topics).slice(0, 5), // Макс 5 тем
      }))
      .sort((a, b) => b.relevantCases - a.relevantCases)
      .slice(0, 5); // Топ-5 экспертов
  }
}
