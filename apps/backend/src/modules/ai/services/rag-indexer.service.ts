import { Injectable, Logger } from '@nestjs/common';
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
  totalChunks: number;
  failedRequests: number;
  startedAt: Date;
  finishedAt?: Date;
  isRunning: boolean;
}

/**
 * Опции индексации
 */
export interface IndexingOptions {
  batchSize?: number;
  maxRequests?: number;
  modifiedAfter?: Date;
  onProgress?: (stats: IndexingStats) => void;
}

/**
 * RAG Indexer Service
 *
 * Индексирует данные из Legacy CRM в векторную базу знаний для RAG.
 * Обрабатывает заявки (QD_requests) и ответы (QD_answers),
 * разбивает на чанки и создаёт embeddings.
 */
@Injectable()
export class RagIndexerService {
  private readonly logger = new Logger(RagIndexerService.name);

  // Параметры чанкинга
  private readonly CHUNK_SIZE = 512; // токенов (примерно 2000 символов)
  private readonly CHUNK_OVERLAP = 50; // токенов overlap между чанками
  private readonly CHARS_PER_TOKEN = 4; // примерное соотношение символов к токенам

  // Статус индексации
  private indexingStats: IndexingStats | null = null;

  constructor(
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly legacyService: LegacyService,
  ) {}

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
   * Запустить полную индексацию legacy данных
   */
  async indexAll(options: IndexingOptions = {}): Promise<IndexingStats> {
    const {
      batchSize = 50,
      maxRequests,
      modifiedAfter,
      onProgress,
    } = options;

    if (!this.isAvailable()) {
      throw new Error('RAG Indexer недоступен: проверьте настройки OpenAI и Legacy DB');
    }

    if (this.indexingStats?.isRunning) {
      throw new Error('Индексация уже выполняется');
    }

    // Получаем общее количество заявок для индексации
    const totalCount = await this.legacyService.getIndexableRequestsCount();
    const requestsToProcess = maxRequests ? Math.min(totalCount, maxRequests) : totalCount;

    this.indexingStats = {
      totalRequests: requestsToProcess,
      processedRequests: 0,
      totalChunks: 0,
      failedRequests: 0,
      startedAt: new Date(),
      isRunning: true,
    };

    this.logger.log(`Начало индексации: ${requestsToProcess} заявок`);

    try {
      let offset = 0;

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

        // Получаем ответы для batch заявок
        const requestIds = requests.map(r => r.id);
        const requestsWithAnswers = await this.legacyService.getRequestsWithAnswersBatch(requestIds);

        // Индексируем каждую заявку
        for (const [requestId, data] of requestsWithAnswers) {
          try {
            const chunksCreated = await this.indexRequest(data.request, data.answers);
            this.indexingStats.totalChunks += chunksCreated;
          } catch (error) {
            this.logger.error(`Ошибка индексации заявки ${requestId}: ${error.message}`);
            this.indexingStats.failedRequests++;
          }

          this.indexingStats.processedRequests++;

          if (onProgress) {
            onProgress(this.indexingStats);
          }
        }

        offset += requests.length;

        // Логируем прогресс каждые 100 заявок
        if (this.indexingStats.processedRequests % 100 === 0) {
          this.logger.log(
            `Прогресс: ${this.indexingStats.processedRequests}/${requestsToProcess} ` +
            `(${Math.round(this.indexingStats.processedRequests / requestsToProcess * 100)}%)`
          );
        }
      }
    } finally {
      this.indexingStats.isRunning = false;
      this.indexingStats.finishedAt = new Date();
    }

    this.logger.log(
      `Индексация завершена: ${this.indexingStats.processedRequests} заявок, ` +
      `${this.indexingStats.totalChunks} чанков, ` +
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
    const chunks = this.splitIntoChunks(fullText);

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
            closedAt: request.closedAt?.toISOString(),
            chunkIndex: i,
            totalChunks: chunks.length,
            answersCount: answers.length,
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
    }

    return createdCount;
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
    priority: string;
    priorityLevel: number;
    requestType?: string;
    resolutionTimeHours?: number;
    resolutionTimeDays?: number;
    firstResponseTimeHours?: number;
    responseCount: number;
    internalResponseCount: number;
  } {
    const result: {
      priority: string;
      priorityLevel: number;
      requestType?: string;
      resolutionTimeHours?: number;
      resolutionTimeDays?: number;
      firstResponseTimeHours?: number;
      responseCount: number;
      internalResponseCount: number;
    } = {
      priority: request.priorityLabel,
      priorityLevel: request.priority,
      requestType: request.type || undefined,
      responseCount: answers.length,
      internalResponseCount: answers.filter(a => a.isInternal === 1).length,
    };

    // Расчёт времени решения
    if (request.createdAt && request.closedAt) {
      const diffMs = request.closedAt.getTime() - request.createdAt.getTime();
      result.resolutionTimeHours = Math.round(diffMs / (1000 * 60 * 60));
      result.resolutionTimeDays = Math.round(diffMs / (1000 * 60 * 60 * 24) * 10) / 10;
    }

    // Время первого ответа
    const firstResponse = answers.find(a => !a.isInternal || a.isInternal !== 1);
    if (request.createdAt && firstResponse?.createdAt) {
      const diffMs = firstResponse.createdAt.getTime() - request.createdAt.getTime();
      result.firstResponseTimeHours = Math.round(diffMs / (1000 * 60 * 60) * 10) / 10;
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
        // Если это не ответ клиента
        if (answer.customerId && answer.customerId !== clientId) {
          specialistIds.add(answer.customerId);
        }
        // Внутренние ответы обычно от специалистов
        if (answer.isInternal === 1 && answer.customerId) {
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

    // Текст заявки
    if (request.body) {
      parts.push(`\nОбращение клиента:\n${this.cleanHtml(request.body)}`);
    }

    // Ответы (диалог)
    if (answers.length > 0) {
      parts.push('\n--- Переписка ---');

      for (const answer of answers) {
        if (answer.answer && answer.answer.trim()) {
          const sender = answer.customerId ? 'Клиент' : 'Специалист';
          const date = answer.createdAt
            ? answer.createdAt.toLocaleDateString('ru-RU')
            : '';

          parts.push(`\n[${sender}${date ? ` от ${date}` : ''}]:`);
          parts.push(this.cleanHtml(answer.answer));
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
}
