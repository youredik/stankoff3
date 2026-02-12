import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LegacyService } from '../../legacy/services/legacy.service';
import { LegacyRequest, LegacyAnswer } from '../../legacy/entities';

/**
 * Результат индексации одной заявки
 */
export interface IndexResult {
  requestId: number;
  chunksCreated: number;
  success: boolean;
  error?: string;
}

/**
 * Статистика индексации
 */
export interface IndexingStats {
  totalRequests: number;
  processedRequests: number;
  skippedRequests: number;
  totalChunks: number;
  failedRequests: number;
  startedAt: Date;
  finishedAt?: Date;
  isRunning: boolean;
}

/**
 * Сохранённое состояние индексации (в БД)
 */
interface IndexerState {
  id: string;
  last_processed_offset: number;
  total_requests: number;
  processed_requests: number;
  skipped_requests: number;
  total_chunks: number;
  failed_requests: number;
  is_completed: boolean;
  started_at: Date | null;
  updated_at: Date;
}

/**
 * Опции индексации
 */
export interface IndexingOptions {
  batchSize?: number;
  maxRequests?: number;
  modifiedAfter?: Date;
  onProgress?: (stats: IndexingStats) => void;
  /** Начать сначала, игнорируя сохранённый прогресс */
  resetProgress?: boolean;
  /** Переиндексировать даже уже проиндексированные заявки (с новым context prefix) */
  forceReindex?: boolean;
}

/**
 * RAG Indexer Service
 *
 * Индексирует данные из Legacy CRM в векторную базу знаний для RAG.
 * Обрабатывает заявки (QD_requests) и ответы (QD_answers),
 * разбивает на чанки и создаёт embeddings.
 *
 * Поддерживает persistent progress — при рестарте контейнера
 * продолжает индексацию с сохранённого offset.
 */
@Injectable()
export class RagIndexerService implements OnModuleInit {
  private readonly logger = new Logger(RagIndexerService.name);

  // Параметры чанкинга
  private readonly CHUNK_SIZE = 512; // токенов (примерно 2000 символов)
  private readonly CHUNK_OVERLAP = 50; // токенов overlap между чанками
  private readonly CHARS_PER_TOKEN = 4; // примерное соотношение символов к токенам

  // Rate limiting для Yandex Cloud Embeddings API (лимит 10 req/sec)
  private readonly EMBED_DELAY_MS = 150; // задержка между embed вызовами

  // Persistent progress: сохраняем offset каждые N batch'ей
  private readonly SAVE_STATE_EVERY_BATCHES = 10;
  private readonly INDEXER_STATE_ID = 'rag_legacy';

  // Auto-resume: задержка перед автозапуском (даём сервисам прогреться)
  private readonly AUTO_RESUME_DELAY_MS = 30_000; // 30 секунд

  // Статус индексации
  private indexingStats: IndexingStats | null = null;

  constructor(
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly legacyService: LegacyService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * При старте приложения проверяем незавершённую индексацию
   * и автоматически возобновляем её через 30 секунд
   */
  async onModuleInit(): Promise<void> {
    // Запускаем проверку в фоне (не блокируем старт приложения)
    this.autoResumeIndexing().catch(err => {
      this.logger.warn(`Auto-resume индексации пропущен: ${err.message}`);
    });
  }

  private async autoResumeIndexing(): Promise<void> {
    // Ждём, пока все сервисы запустятся
    await this.delay(this.AUTO_RESUME_DELAY_MS);

    // Проверяем доступность сервисов
    if (!this.isAvailable()) {
      this.logger.debug('Auto-resume: AI или Legacy сервис недоступен, пропускаем');
      return;
    }

    // Проверяем есть ли незавершённая индексация
    const savedState = await this.loadState();

    if (!savedState) {
      this.logger.debug('Auto-resume: нет сохранённого состояния индексации');
      return;
    }

    if (savedState.is_completed) {
      this.logger.debug('Auto-resume: индексация уже завершена');
      return;
    }

    this.logger.log(
      `Auto-resume: найдена незавершённая индексация ` +
      `(offset: ${savedState.last_processed_offset}, ` +
      `обработано: ${savedState.processed_requests}/${savedState.total_requests}). ` +
      `Возобновляем...`
    );

    try {
      await this.indexAll();
    } catch (error) {
      this.logger.error(`Auto-resume: ошибка возобновления индексации: ${error.message}`);
    }
  }

  /**
   * Проверка доступности сервисов для индексации
   */
  isAvailable(): boolean {
    return this.knowledgeBase.isAvailable() && this.legacyService.isAvailable();
  }

  /**
   * Получить текущий статус индексации
   */
  getStatus(): IndexingStats | null {
    return this.indexingStats;
  }

  /**
   * Загрузить сохранённое состояние индексации из БД
   */
  async loadState(): Promise<IndexerState | null> {
    try {
      const rows = await this.dataSource.query<IndexerState[]>(
        `SELECT * FROM indexer_state WHERE id = $1`,
        [this.INDEXER_STATE_ID],
      );
      return rows.length > 0 ? rows[0] : null;
    } catch {
      // Таблица может не существовать (до миграции)
      return null;
    }
  }

  /**
   * Сохранить текущее состояние индексации в БД
   */
  private async saveState(offset: number, isCompleted: boolean = false): Promise<void> {
    if (!this.indexingStats) return;

    try {
      await this.dataSource.query(
        `INSERT INTO indexer_state (id, last_processed_offset, total_requests, processed_requests,
          skipped_requests, total_chunks, failed_requests, is_completed, started_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
          last_processed_offset = $2,
          total_requests = $3,
          processed_requests = $4,
          skipped_requests = $5,
          total_chunks = $6,
          failed_requests = $7,
          is_completed = $8,
          started_at = $9,
          updated_at = NOW()`,
        [
          this.INDEXER_STATE_ID,
          offset,
          this.indexingStats.totalRequests,
          this.indexingStats.processedRequests,
          this.indexingStats.skippedRequests,
          this.indexingStats.totalChunks,
          this.indexingStats.failedRequests,
          isCompleted,
          this.indexingStats.startedAt,
        ],
      );
    } catch (error) {
      this.logger.warn(`Ошибка сохранения состояния индексации: ${error.message}`);
    }
  }

  /**
   * Запустить полную индексацию legacy данных
   */
  async indexAll(options: IndexingOptions = {}): Promise<IndexingStats> {
    const {
      batchSize = 10,
      maxRequests,
      modifiedAfter,
      onProgress,
      resetProgress = false,
      forceReindex = false,
    } = options;

    if (!this.isAvailable()) {
      throw new Error('RAG Indexer недоступен: проверьте настройки AI провайдеров и Legacy DB');
    }

    if (this.indexingStats?.isRunning) {
      throw new Error('Индексация уже выполняется');
    }

    // Получаем общее количество заявок для индексации
    const totalCount = await this.legacyService.getIndexableRequestsCount();
    const requestsToProcess = maxRequests ? Math.min(totalCount, maxRequests) : totalCount;

    // Загружаем сохранённый прогресс
    let startOffset = 0;
    let resumedStats: Partial<IndexingStats> = {};

    if (!resetProgress) {
      const savedState = await this.loadState();
      if (savedState && !savedState.is_completed && savedState.total_requests > 0) {
        startOffset = savedState.last_processed_offset;
        resumedStats = {
          processedRequests: savedState.processed_requests,
          skippedRequests: savedState.skipped_requests,
          totalChunks: savedState.total_chunks,
          failedRequests: savedState.failed_requests,
        };
        this.logger.log(
          `Возобновление индексации с offset ${startOffset} ` +
          `(обработано: ${savedState.processed_requests}, пропущено: ${savedState.skipped_requests})`
        );
      }
    }

    this.indexingStats = {
      totalRequests: requestsToProcess,
      processedRequests: resumedStats.processedRequests || 0,
      skippedRequests: resumedStats.skippedRequests || 0,
      totalChunks: resumedStats.totalChunks || 0,
      failedRequests: resumedStats.failedRequests || 0,
      startedAt: new Date(),
      isRunning: true,
    };

    this.logger.log(
      `Начало индексации: ${requestsToProcess} заявок` +
      (startOffset > 0 ? ` (продолжение с offset ${startOffset})` : '')
    );

    try {
      let offset = startOffset;
      let batchesSinceLastSave = 0;

      while (offset < requestsToProcess) {
        const limit = Math.min(batchSize, requestsToProcess - offset);

        const { items: requests } = await this.legacyService.getRequestsForIndexing({
          limit,
          offset,
          modifiedAfter,
        });

        if (requests.length === 0) {
          break;
        }

        const requestIds = requests.map(r => r.id);

        let newRequestIds: number[];
        let skippedCount: number;

        if (forceReindex) {
          // При forceReindex индексируем все заявки (старые чанки удалятся в indexRequest)
          newRequestIds = requestIds;
          skippedCount = 0;
        } else {
          // Проверяем какие заявки уже проиндексированы (один SQL запрос на batch)
          const alreadyIndexed = await this.knowledgeBase.getIndexedSourceIds(
            'legacy_request',
            requestIds.map(String),
          );

          // Фильтруем — оставляем только ещё не проиндексированные
          newRequestIds = requestIds.filter(id => !alreadyIndexed.has(String(id)));
          skippedCount = requestIds.length - newRequestIds.length;
        }

        this.indexingStats.skippedRequests += skippedCount;

        if (newRequestIds.length > 0) {
          // Получаем ответы только для новых заявок
          const requestsWithAnswers = await this.legacyService.getRequestsWithAnswersBatch(newRequestIds);

          // Индексируем каждую заявку (с задержкой между ними для rate limiting)
          let requestIndex = 0;
          for (const [requestId, data] of requestsWithAnswers) {
            try {
              const chunksCreated = await this.indexRequest(data.request, data.answers);
              this.indexingStats.totalChunks += chunksCreated;
            } catch (error) {
              this.logger.error(`Ошибка индексации заявки ${requestId}: ${error.message}`);
              this.indexingStats.failedRequests++;
            }

            this.indexingStats.processedRequests++;
            requestIndex++;

            if (onProgress) {
              onProgress(this.indexingStats);
            }

            // Rate limiting: задержка между заявками (Yandex Cloud: 10 req/sec)
            if (requestIndex < requestsWithAnswers.size) {
              await this.delay(this.EMBED_DELAY_MS);
            }
          }
        }

        // processedRequests считает и пропущенные (для корректного progress %)
        this.indexingStats.processedRequests += skippedCount;
        offset += requests.length;
        batchesSinceLastSave++;

        // Сохраняем прогресс каждые N batch'ей
        if (batchesSinceLastSave >= this.SAVE_STATE_EVERY_BATCHES) {
          await this.saveState(offset);
          batchesSinceLastSave = 0;
        }

        // Логируем прогресс каждые 100 заявок
        if (this.indexingStats.processedRequests % 100 === 0) {
          const skipped = this.indexingStats.skippedRequests;
          this.logger.log(
            `Прогресс: ${this.indexingStats.processedRequests}/${requestsToProcess} ` +
            `(${Math.round(this.indexingStats.processedRequests / requestsToProcess * 100)}%)` +
            (skipped > 0 ? ` [пропущено: ${skipped}]` : '')
          );
        }
      }
    } finally {
      this.indexingStats.isRunning = false;
      this.indexingStats.finishedAt = new Date();
      // Сохраняем финальное состояние
      await this.saveState(
        this.indexingStats.processedRequests,
        this.indexingStats.processedRequests >= this.indexingStats.totalRequests,
      );
    }

    this.logger.log(
      `Индексация завершена: ${this.indexingStats.processedRequests} заявок, ` +
      `${this.indexingStats.totalChunks} чанков, ` +
      `${this.indexingStats.skippedRequests} пропущено, ` +
      `${this.indexingStats.failedRequests} ошибок`
    );

    return this.indexingStats;
  }

  /**
   * Индексировать одну заявку с ответами
   * Включает информацию о сотрудниках, клиенте, контрагенте и аналитику
   */
  async indexRequest(request: LegacyRequest, answers: LegacyAnswer[]): Promise<number> {
    // Формируем полный текст диалога
    const fullText = this.formatRequestWithAnswers(request, answers);

    if (!fullText || fullText.trim().length < 50) {
      return 0; // Слишком короткий текст
    }

    // Получаем расширенную информацию параллельно
    const [employeeInfo, customerInfo, analytics] = await Promise.all([
      this.extractEmployeeInfo(request, answers),
      this.extractCustomerInfo(request.customerId),
      this.extractAnalytics(request, answers),
    ]);

    // Удаляем старые чанки для этой заявки
    await this.knowledgeBase.removeChunksBySource('legacy_request', String(request.id));

    // Разбиваем на чанки
    const rawChunks = this.splitIntoChunks(fullText);

    // Contextual Retrieval: добавляем контекстный префикс к каждому чанку
    // Это обогащает embedding семантикой заявки (клиент, тема, менеджер)
    const contextPrefix = this.buildContextPrefix(request, employeeInfo, customerInfo, analytics);
    const chunks = rawChunks.map(chunk => `${contextPrefix}\n\n${chunk}`);

    // Создаём чанки в базе знаний
    let createdCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        await this.knowledgeBase.addChunk({
          content: chunks[i],
          sourceType: 'legacy_request',
          sourceId: String(request.id),
          metadata: {
            requestId: request.id,
            subject: request.subject,
            customerId: request.customerId,
            managerId: request.managerId,
            createdAt: request.createdAt?.toISOString(),
            closedAt: request.isClosed ? (request.updatedAt || request.createdAt)?.toISOString() : null,
            chunkIndex: i,
            totalChunks: chunks.length,
            answersCount: answers.length,
            chunkVersion: 2,
            // Ссылка на legacy систему
            legacyUrl: `https://www.stankoff.ru/crm/request/${request.id}`,
            // Информация о сотрудниках (для подсказок AI)
            ...employeeInfo,
            // Информация о клиенте и контрагенте
            ...customerInfo,
            // Аналитика заявки
            ...analytics,
          },
        });
        createdCount++;
      } catch (error) {
        this.logger.warn(`Не удалось создать чанк ${i} для заявки ${request.id}: ${error.message}`);
      }

      // Rate limiting: задержка между embed вызовами (Yandex Cloud: 10 req/sec)
      if (i < chunks.length - 1) {
        await this.delay(this.EMBED_DELAY_MS);
      }
    }

    return createdCount;
  }

  /**
   * Строит контекстный префикс для чанка из метаданных заявки.
   * Детерминированный (без LLM вызова), обогащает embedding семантикой.
   */
  buildContextPrefix(
    request: LegacyRequest,
    employeeInfo: { managerName?: string },
    customerInfo: { customerName?: string; counterpartyName?: string },
    analytics: { requestType?: string },
  ): string {
    const parts: string[] = [];
    parts.push(`Заявка #${request.id}`);
    if (request.subject) parts.push(`Тема: ${request.subject}`);
    if (customerInfo.customerName) parts.push(`Клиент: ${customerInfo.customerName}`);
    if (customerInfo.counterpartyName) parts.push(`Контрагент: ${customerInfo.counterpartyName}`);
    if (analytics.requestType) parts.push(`Категория: ${analytics.requestType}`);
    if (employeeInfo.managerName) parts.push(`Менеджер: ${employeeInfo.managerName}`);
    return parts.join(' | ');
  }

  /**
   * Извлечь информацию о клиенте и контрагенте
   */
  private async extractCustomerInfo(customerId: number): Promise<{
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerIsEmployee: boolean;
    customerTotalRequests?: number;
    counterpartyId?: number;
    counterpartyName?: string;
    counterpartyInn?: string;
    counterpartyUrl?: string;
    relatedDeals?: Array<{
      id: number;
      name: string;
      sum: number;
      isClosed: boolean;
      url: string;
    }>;
  }> {
    const result: {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      customerIsEmployee: boolean;
      customerTotalRequests?: number;
      counterpartyId?: number;
      counterpartyName?: string;
      counterpartyInn?: string;
      counterpartyUrl?: string;
      relatedDeals?: Array<{
        id: number;
        name: string;
        sum: number;
        isClosed: boolean;
        url: string;
      }>;
    } = {
      customerIsEmployee: false,
    };

    if (!customerId) {
      return result;
    }

    try {
      // Получаем полную информацию о клиенте
      const customerInfo = await this.legacyService.getCustomerRichInfo(customerId);

      if (customerInfo) {
        result.customerName = customerInfo.fullName;
        result.customerEmail = customerInfo.email;
        result.customerPhone = customerInfo.phone;
        result.customerIsEmployee = customerInfo.isEmployee;
        result.customerTotalRequests = customerInfo.totalRequests;

        // Информация о контрагенте
        if (customerInfo.counterparty) {
          result.counterpartyId = customerInfo.counterparty.id;
          result.counterpartyName = customerInfo.counterparty.name;
          result.counterpartyInn = customerInfo.counterparty.inn;
          result.counterpartyUrl = `https://www.stankoff.ru/crm/counterparty/${customerInfo.counterparty.id}`;

          // Получаем связанные сделки контрагента
          const deals = await this.legacyService.getDealsByCounterpartyId(customerInfo.counterparty.id);
          if (deals.length > 0) {
            result.relatedDeals = deals.slice(0, 5).map(deal => ({
              id: deal.id,
              name: deal.name,
              sum: deal.sum,
              isClosed: deal.isClosed,
              url: `https://www.stankoff.ru/crm/deal/${deal.id}`,
            }));
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Ошибка получения информации о клиенте ${customerId}: ${error.message}`);
    }

    return result;
  }

  /**
   * Извлечь аналитику из заявки
   */
  private extractAnalytics(
    request: LegacyRequest,
    answers: LegacyAnswer[],
  ): {
    requestType?: string;
    resolutionTimeHours?: number;
    resolutionTimeDays?: number;
    firstResponseTimeHours?: number;
    responseCount: number;
    clientResponseCount: number;
  } {
    const result: {
      requestType?: string;
      resolutionTimeHours?: number;
      resolutionTimeDays?: number;
      firstResponseTimeHours?: number;
      responseCount: number;
      clientResponseCount: number;
    } = {
      requestType: request.type || undefined,
      responseCount: answers.length,
      clientResponseCount: answers.filter(a => a.isClient === 1).length,
    };

    // Расчёт времени решения (используем updatedAt как приблизительную дату закрытия)
    const closedAt = request.isClosed ? (request.updatedAt || request.createdAt) : null;
    if (request.createdAt && closedAt) {
      const diffMs = closedAt.getTime() - request.createdAt.getTime();
      result.resolutionTimeHours = Math.round(diffMs / (1000 * 60 * 60));
      result.resolutionTimeDays = Math.round(diffMs / (1000 * 60 * 60 * 24) * 10) / 10;
    }

    // Время первого ответа (используем firstReactionTime из legacy или ответы)
    if (request.firstReactionTime) {
      // firstReactionTime хранится в секундах в legacy БД
      result.firstResponseTimeHours = Math.round(request.firstReactionTime / 3600 * 10) / 10;
    } else {
      // Fallback: ищем первый ответ не от клиента
      const firstResponse = answers.find(a => a.isClient !== 1);
      if (request.createdAt && firstResponse?.createdAt) {
        const diffMs = firstResponse.createdAt.getTime() - request.createdAt.getTime();
        result.firstResponseTimeHours = Math.round(diffMs / (1000 * 60 * 60) * 10) / 10;
      }
    }

    return result;
  }

  /**
   * Извлечь информацию о сотрудниках из заявки и ответов
   */
  private async extractEmployeeInfo(
    request: LegacyRequest,
    answers: LegacyAnswer[],
  ): Promise<{
    managerName?: string;
    managerDepartment?: string;
    specialists: Array<{ id: number; name: string }>;
    specialistNames: string[];
  }> {
    const result: {
      managerName?: string;
      managerDepartment?: string;
      specialists: Array<{ id: number; name: string }>;
      specialistNames: string[];
    } = {
      specialists: [],
      specialistNames: [],
    };

    try {
      // Получаем информацию о менеджере заявки
      if (request.managerId) {
        const managerInfo = await this.legacyService.getManagerInfo(request.managerId);
        if (managerInfo) {
          result.managerName = managerInfo.fullName;
          result.managerDepartment = managerInfo.departmentName;

          // Добавляем менеджера в список специалистов
          result.specialists.push({
            id: request.managerId,
            name: managerInfo.fullName,
          });
        }
      }

      // Собираем ID сотрудников из ответов (ответы без customerId от клиента)
      // В legacy системе: если customerId совпадает с клиентом заявки - это клиент
      // Если customerId отличается или это внутренний ответ - это специалист
      const clientId = request.customerId;
      const specialistIds = new Set<number>();

      for (const answer of answers) {
        // Если это не ответ клиента (isClient === 0 означает ответ специалиста)
        if (answer.customerId && (answer.customerId !== clientId || answer.isClient !== 1)) {
          specialistIds.add(answer.customerId);
        }
      }

      // Получаем имена специалистов
      if (specialistIds.size > 0) {
        const employeeNames = await this.legacyService.getEmployeeNamesByUserIds(
          Array.from(specialistIds),
        );

        for (const [id, info] of employeeNames) {
          // Не дублируем менеджера
          if (!result.specialists.some(s => s.name === info.fullName)) {
            result.specialists.push({ id, name: info.fullName });
          }
        }
      }

      // Формируем массив имён для удобства поиска
      result.specialistNames = result.specialists.map(s => s.name);
    } catch (error) {
      this.logger.warn(`Ошибка получения информации о сотрудниках: ${error.message}`);
    }

    return result;
  }

  /**
   * Переиндексировать конкретную заявку
   */
  async reindexRequest(requestId: number): Promise<IndexResult> {
    if (!this.isAvailable()) {
      return {
        requestId,
        chunksCreated: 0,
        success: false,
        error: 'RAG Indexer недоступен',
      };
    }

    try {
      const data = await this.legacyService.getRequestWithAnswers(requestId);

      if (!data.request) {
        return {
          requestId,
          chunksCreated: 0,
          success: false,
          error: 'Заявка не найдена',
        };
      }

      const chunksCreated = await this.indexRequest(data.request, data.answers);

      return {
        requestId,
        chunksCreated,
        success: true,
      };
    } catch (error) {
      return {
        requestId,
        chunksCreated: 0,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Получить статистику индексации
   */
  async getIndexingStatistics(): Promise<{
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
    const [legacyStats, kbStats] = await Promise.all([
      this.legacyService.getIndexingStats(),
      this.knowledgeBase.getStats(),
    ]);

    // Подсчитываем уникальные проиндексированные заявки
    const legacyRequestChunks = kbStats.bySourceType['legacy_request'] || 0;
    // Примерная оценка (в среднем 2-3 чанка на заявку)
    const estimatedIndexedRequests = Math.round(legacyRequestChunks / 2.5);

    return {
      legacy: legacyStats,
      knowledgeBase: kbStats,
      coverage: {
        indexedRequests: estimatedIndexedRequests,
        percentage: legacyStats.closedRequests > 0
          ? Math.round(estimatedIndexedRequests / legacyStats.closedRequests * 100)
          : 0,
      },
    };
  }

  /**
   * Форматирует заявку с ответами в единый текст для индексации
   */
  private formatRequestWithAnswers(request: LegacyRequest, answers: LegacyAnswer[]): string {
    const parts: string[] = [];

    // Заголовок заявки
    if (request.subject) {
      parts.push(`Тема: ${request.subject}`);
    }

    // Ответы (диалог)
    if (answers.length > 0) {
      parts.push('\n--- Переписка ---');

      for (const answer of answers) {
        if (answer.text && answer.text.trim()) {
          const sender = answer.isClient === 1 ? 'Клиент' : 'Специалист';
          const date = answer.createdAt
            ? answer.createdAt.toLocaleDateString('ru-RU')
            : '';

          parts.push(`\n[${sender}${date ? ` от ${date}` : ''}]:`);
          parts.push(this.cleanHtml(answer.text));
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Очищает HTML-теги и лишние пробелы
   */
  private cleanHtml(text: string): string {
    if (!text) return '';

    return text
      // Удаляем HTML теги
      .replace(/<[^>]*>/g, ' ')
      // Декодируем HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      // Удаляем множественные пробелы
      .replace(/\s+/g, ' ')
      // Удаляем пробелы в начале и конце
      .trim();
  }

  /**
   * Разбивает текст на чанки с overlap
   */
  private splitIntoChunks(text: string): string[] {
    const chunkSizeChars = this.CHUNK_SIZE * this.CHARS_PER_TOKEN;
    const overlapChars = this.CHUNK_OVERLAP * this.CHARS_PER_TOKEN;

    if (text.length <= chunkSizeChars) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSizeChars;

      // Если это не последний чанк, ищем границу предложения
      if (end < text.length) {
        // Ищем конец предложения (. ! ?) в последних 200 символах чанка
        const searchStart = Math.max(end - 200, start);
        const searchText = text.slice(searchStart, end);

        const lastSentenceEnd = Math.max(
          searchText.lastIndexOf('. '),
          searchText.lastIndexOf('! '),
          searchText.lastIndexOf('? '),
          searchText.lastIndexOf('.\n'),
          searchText.lastIndexOf('!\n'),
          searchText.lastIndexOf('?\n'),
        );

        if (lastSentenceEnd > 0) {
          end = searchStart + lastSentenceEnd + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());

      // Следующий чанк начинается с overlap
      const nextStart = end - overlapChars;

      // Если overlap привёл бы к бесконечному циклу (start не сдвинулся вперёд)
      if (nextStart <= start) {
        start = end;
      } else {
        start = nextStart;
      }
    }

    return chunks.filter(chunk => chunk.length > 50); // Минимальная длина чанка
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
