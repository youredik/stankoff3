import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LegacyUrlService } from '../../legacy/services/legacy-url.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { Comment } from '../../entity/comment.entity';
import {
  AiAssistantResponse,
  SimilarCase,
  SuggestedExpert,
  RelatedContext,
  GeneratedResponseDto,
  StreamingEvent,
} from '../dto/ai.dto';
import { extractJson } from '../utils/extract-json';

/**
 * AI Assistant Service
 *
 * Предоставляет AI помощь в контексте entity:
 * - Поиск похожих решённых случаев
 * - Рекомендации экспертов
 * - Связанный контекст (контрагенты, сделки)
 * - Предложения для ответа
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  // In-memory кэш для результатов getAssistance (TTL 5 мин)
  private readonly cache = new Map<
    string,
    { data: AiAssistantResponse; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly CACHE_MAX_SIZE = 200;

  // Кэш summary (TTL 5 мин)
  private readonly summaryCache = new Map<
    string,
    { summary: string; expiresAt: number }
  >();

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly legacyUrlService: LegacyUrlService,
    private readonly providerRegistry: AiProviderRegistry,
  ) {}

  /**
   * Проверка доступности AI помощника
   */
  isAvailable(): boolean {
    return this.knowledgeBaseService.isAvailable();
  }

  /**
   * Получить AI помощь для entity
   */
  async getAssistance(entityId: string): Promise<AiAssistantResponse> {
    if (!this.isAvailable()) {
      return {
        available: false,
        similarCases: [],
        suggestedExperts: [],
      };
    }

    // Проверяем кэш
    const cached = this.cache.get(entityId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Получаем entity
    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
    });

    if (!entity) {
      return {
        available: true,
        similarCases: [],
        suggestedExperts: [],
      };
    }

    // Формируем поисковый запрос из title и description
    const query = this.buildSearchQuery(entity);

    if (!query || query.length < 10) {
      return {
        available: true,
        similarCases: [],
        suggestedExperts: [],
      };
    }

    try {
      // Ищем похожие случаи в базе знаний
      const searchResults = await this.knowledgeBaseService.searchSimilar({
        query,
        sourceType: 'legacy_request',
        limit: 10,
        minSimilarity: 0.5,
      });

      // Извлекаем похожие случаи
      const similarCases = this.extractSimilarCases(searchResults);

      // Извлекаем экспертов
      const suggestedExperts = this.extractExperts(searchResults);

      // Извлекаем контекст (контрагенты, сделки)
      const relatedContext = this.extractRelatedContext(searchResults);

      // Генерируем рекомендуемые действия
      const suggestedActions = this.generateSuggestedActions(
        entity,
        similarCases,
        suggestedExperts,
      );

      // Извлекаем ключевые слова
      const keywords = this.extractKeywords(searchResults);

      // Анализ настроения (не блокируем основной ответ)
      let sentiment: AiAssistantResponse['sentiment'];
      try {
        sentiment = await this.analyzeSentiment(entityId) ?? undefined;
      } catch {
        // Sentiment не критичен, пропускаем при ошибке
      }

      const result: AiAssistantResponse = {
        available: true,
        similarCases,
        suggestedExperts,
        relatedContext: Object.keys(relatedContext).length > 0 ? relatedContext : undefined,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        sentiment,
      };

      // Сохраняем в кэш
      this.cache.set(entityId, {
        data: result,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      if (this.cache.size > this.CACHE_MAX_SIZE) {
        this.cleanupCache();
      }

      return result;
    } catch (error) {
      this.logger.error(`Ошибка AI помощника: ${error.message}`);
      return {
        available: true,
        similarCases: [],
        suggestedExperts: [],
      };
    }
  }

  /**
   * Сброс кэша для entity (при обновлении)
   */
  invalidateCache(entityId: string): void {
    this.cache.delete(entityId);
  }

  /**
   * Удаление истёкших записей кэша
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Формирует поисковый запрос из entity
   */
  private buildSearchQuery(entity: WorkspaceEntity): string {
    const parts: string[] = [];

    if (entity.title) {
      parts.push(entity.title);
    }

    // Получаем description из data
    const data = entity.data as Record<string, unknown> | undefined;
    if (data?.description && typeof data.description === 'string') {
      parts.push(data.description);
    }

    return parts.join(' ').trim();
  }

  /**
   * Извлекает похожие случаи из результатов поиска
   */
  private extractSimilarCases(results: Array<{
    id: string;
    content: string;
    sourceType: string;
    sourceId: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }>): SimilarCase[] {
    const casesMap = new Map<number, SimilarCase>();

    for (const result of results) {
      if (result.sourceType !== 'legacy_request') {
        continue;
      }

      const metadata = result.metadata || {};
      const requestId = metadata.requestId as number;

      if (!requestId || casesMap.has(requestId)) {
        continue;
      }

      const subject = metadata.subject as string || `Заявка #${requestId}`;
      const resolutionTimeHours = metadata.resolutionTimeHours as number | undefined;
      const specialistNames = metadata.specialistNames as string[] | undefined;

      // Извлекаем краткое резюме из content (первые 200 символов)
      const resolution = result.content.length > 200
        ? result.content.substring(0, 200) + '...'
        : result.content;

      casesMap.set(requestId, {
        requestId,
        subject,
        resolution,
        similarity: Math.round(result.similarity * 100) / 100,
        resolutionTimeHours,
        legacyUrl: this.legacyUrlService.getRequestUrl(requestId),
        specialists: specialistNames?.slice(0, 3),
      });
    }

    // Сортируем по similarity и берём топ-5
    return Array.from(casesMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  /**
   * Извлекает и агрегирует экспертов из результатов
   */
  private extractExperts(results: Array<{
    sourceType: string;
    metadata: Record<string, unknown>;
  }>): SuggestedExpert[] {
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

      // Менеджер заявки
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

      // Специалисты из ответов
      const specialists = metadata.specialists as Array<{ id: number; name: string }> | undefined;
      if (specialists && Array.isArray(specialists)) {
        for (const specialist of specialists) {
          const existing = expertsMap.get(specialist.name) || {
            name: specialist.name,
            managerId: specialist.id,
            cases: new Set(),
            topics: new Set(),
          };
          if (requestId) existing.cases.add(requestId);
          if (subject) existing.topics.add(subject);
          expertsMap.set(specialist.name, existing);
        }
      }
    }

    return Array.from(expertsMap.values())
      .map(expert => ({
        name: expert.name,
        managerId: expert.managerId,
        department: expert.department,
        relevantCases: expert.cases.size,
        topics: Array.from(expert.topics).slice(0, 5),
      }))
      .sort((a, b) => b.relevantCases - a.relevantCases)
      .slice(0, 5);
  }

  /**
   * Извлекает связанный контекст (контрагенты, сделки)
   */
  private extractRelatedContext(results: Array<{
    sourceType: string;
    metadata: Record<string, unknown>;
  }>): RelatedContext {
    const context: RelatedContext = {};

    // Находим первый результат с информацией о контрагенте
    for (const result of results) {
      if (result.sourceType !== 'legacy_request') {
        continue;
      }

      const metadata = result.metadata || {};

      // Контрагент
      if (!context.counterpartyName && metadata.counterpartyName) {
        context.counterpartyName = String(metadata.counterpartyName);
        context.counterpartyUrl = metadata.counterpartyUrl as string;
      }

      // Сделки
      if (!context.deals && metadata.relatedDeals) {
        const deals = metadata.relatedDeals as Array<{
          id: number;
          name: string;
          sum: number;
          url: string;
        }>;
        if (Array.isArray(deals) && deals.length > 0) {
          context.deals = deals.slice(0, 3);
        }
      }

      // Количество обращений клиента
      if (!context.customerTotalRequests && metadata.customerTotalRequests) {
        context.customerTotalRequests = metadata.customerTotalRequests as number;
      }

      // Если собрали достаточно контекста, выходим
      if (context.counterpartyName && context.deals) {
        break;
      }
    }

    // Среднее время решения и основные категории (из всех результатов)
    const resolutionTimes: number[] = [];
    const categoryCount = new Map<string, number>();

    for (const result of results) {
      if (result.sourceType !== 'legacy_request') continue;
      const metadata = result.metadata || {};

      if (metadata.resolutionTimeHours && typeof metadata.resolutionTimeHours === 'number') {
        resolutionTimes.push(metadata.resolutionTimeHours);
      }
      if (metadata.subject && typeof metadata.subject === 'string') {
        // Извлекаем основную тему из subject (первые 2-3 слова)
        const words = metadata.subject.split(/\s+/).slice(0, 3).join(' ');
        if (words.length >= 3) {
          categoryCount.set(words, (categoryCount.get(words) || 0) + 1);
        }
      }
    }

    if (resolutionTimes.length > 0) {
      const avg = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
      context.avgResolutionTimeHours = Math.round(avg * 10) / 10;
    }

    if (categoryCount.size > 0) {
      context.topCategories = Array.from(categoryCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => cat);
    }

    return context;
  }

  /**
   * Генерирует рекомендуемые действия
   */
  private generateSuggestedActions(
    entity: WorkspaceEntity,
    similarCases: SimilarCase[],
    experts: SuggestedExpert[],
  ): string[] {
    const actions: string[] = [];

    // Если есть похожие случаи с быстрым решением
    const fastCase = similarCases.find(c => c.resolutionTimeHours && c.resolutionTimeHours < 24);
    if (fastCase) {
      actions.push(`Изучите похожий случай #${fastCase.requestId} — был решён за ${fastCase.resolutionTimeHours}ч`);
    }

    // Если есть эксперты с опытом
    const topExpert = experts[0];
    if (topExpert && topExpert.relevantCases >= 3) {
      actions.push(`Рекомендуем привлечь ${topExpert.name} (${topExpert.relevantCases} похожих случаев)`);
    }

    // Если нет исполнителя
    if (!entity.assigneeId && experts.length > 0) {
      actions.push('Назначьте исполнителя из рекомендуемых экспертов');
    }

    // Если много похожих случаев
    if (similarCases.length >= 3) {
      actions.push('Проверьте, не является ли это типовой проблемой');
    }

    return actions;
  }

  /**
   * Извлекает ключевые слова из результатов
   */
  private extractKeywords(results: Array<{
    sourceType: string;
    metadata: Record<string, unknown>;
  }>): string[] {
    const keywordsSet = new Set<string>();

    for (const result of results) {
      if (result.sourceType !== 'legacy_request') {
        continue;
      }

      const metadata = result.metadata || {};

      // Тип заявки
      if (metadata.requestType) {
        keywordsSet.add(String(metadata.requestType));
      }

      // Приоритет
      if (metadata.priority) {
        keywordsSet.add(`Приоритет: ${metadata.priority}`);
      }
    }

    return Array.from(keywordsSet).slice(0, 5);
  }

  /**
   * Генерирует черновик ответа на основе похожих случаев
   */
  async generateResponseSuggestion(
    entityId: string,
    additionalContext?: string,
  ): Promise<GeneratedResponseDto> {
    if (!this.providerRegistry.isCompletionAvailable()) {
      throw new Error('AI провайдеры недоступны');
    }

    // Получаем entity
    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
    });

    if (!entity) {
      throw new Error('Заявка не найдена');
    }

    // Получаем похожие случаи
    const query = this.buildSearchQuery(entity);
    if (!query || query.length < 10) {
      throw new Error('Недостаточно данных для генерации');
    }

    const searchResults = await this.knowledgeBaseService.searchSimilar({
      query,
      sourceType: 'legacy_request',
      limit: 5,
      minSimilarity: 0.5,
    });

    if (searchResults.length === 0) {
      throw new Error('Не найдено похожих случаев');
    }

    // Формируем контекст из похожих случаев
    const contextParts: string[] = [];
    const sources: GeneratedResponseDto['sources'] = [];

    for (const result of searchResults) {
      const metadata = result.metadata || {};
      const requestId = metadata.requestId as number;
      const subject = metadata.subject as string || `Заявка #${requestId}`;

      contextParts.push(`--- Похожий случай ---
Тема: ${subject}
Решение: ${result.content.substring(0, 500)}`);

      sources.push({
        type: 'legacy_request',
        id: String(requestId),
        title: subject,
        similarity: Math.round(result.similarity * 100) / 100,
      });
    }

    const context = contextParts.join('\n\n');

    // Формируем промпт
    const prompt = `Ты - специалист техподдержки промышленного оборудования компании "Станкофф".
Твоя задача - сформировать черновик ответа клиенту на основе текущей заявки и похожих решённых случаев.

ТЕКУЩАЯ ЗАЯВКА:
Тема: ${entity.title}
Описание: ${(entity.data as Record<string, unknown>)?.description || 'Нет описания'}
${additionalContext ? `Дополнительный контекст: ${additionalContext}` : ''}

ПОХОЖИЕ РЕШЁННЫЕ СЛУЧАИ:
${context}

ТРЕБОВАНИЯ К ОТВЕТУ:
1. Пиши вежливо и профессионально
2. Используй информацию из похожих случаев
3. Не придумывай технические детали, которых нет в контексте
4. Если решение требует диагностики, предложи уточняющие вопросы
5. Ответ должен быть на русском языке
6. Формат: обычный текст, можно использовать списки

Сформируй черновик ответа:`;

    // Генерируем ответ
    const result = await this.providerRegistry.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 1000,
    });

    return {
      draft: result.content,
      sources,
    };
  }

  /**
   * Генерирует черновик ответа в режиме streaming
   * Yield: { type: 'chunk', text } для текста, { type: 'done', sources } в конце
   */
  async *generateResponseSuggestionStream(
    entityId: string,
    additionalContext?: string,
  ): AsyncGenerator<StreamingEvent> {
    if (!this.providerRegistry.isCompletionAvailable()) {
      throw new Error('AI провайдеры недоступны');
    }

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
    });

    if (!entity) {
      throw new Error('Заявка не найдена');
    }

    const query = this.buildSearchQuery(entity);
    if (!query || query.length < 10) {
      throw new Error('Недостаточно данных для генерации');
    }

    const searchResults = await this.knowledgeBaseService.searchSimilar({
      query,
      sourceType: 'legacy_request',
      limit: 5,
      minSimilarity: 0.5,
    });

    if (searchResults.length === 0) {
      throw new Error('Не найдено похожих случаев');
    }

    const contextParts: string[] = [];
    const sources: GeneratedResponseDto['sources'] = [];

    for (const result of searchResults) {
      const metadata = result.metadata || {};
      const requestId = metadata.requestId as number;
      const subject = metadata.subject as string || `Заявка #${requestId}`;

      contextParts.push(`--- Похожий случай ---
Тема: ${subject}
Решение: ${result.content.substring(0, 500)}`);

      sources.push({
        type: 'legacy_request',
        id: String(requestId),
        title: subject,
        similarity: Math.round(result.similarity * 100) / 100,
      });
    }

    const context = contextParts.join('\n\n');

    const prompt = `Ты - специалист техподдержки промышленного оборудования компании "Станкофф".
Твоя задача - сформировать черновик ответа клиенту на основе текущей заявки и похожих решённых случаев.

ТЕКУЩАЯ ЗАЯВКА:
Тема: ${entity.title}
Описание: ${(entity.data as Record<string, unknown>)?.description || 'Нет описания'}
${additionalContext ? `Дополнительный контекст: ${additionalContext}` : ''}

ПОХОЖИЕ РЕШЁННЫЕ СЛУЧАИ:
${context}

ТРЕБОВАНИЯ К ОТВЕТУ:
1. Пиши вежливо и профессионально
2. Используй информацию из похожих случаев
3. Не придумывай технические детали, которых нет в контексте
4. Если решение требует диагностики, предложи уточняющие вопросы
5. Ответ должен быть на русском языке
6. Формат: обычный текст, можно использовать списки

Сформируй черновик ответа:`;

    // Streaming от LLM
    for await (const chunk of this.providerRegistry.completeStream({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 1000,
    })) {
      yield { type: 'chunk' as const, text: chunk };
    }

    yield { type: 'done' as const, sources };
  }

  /**
   * Резюме переписки по entity
   */
  async summarizeConversation(entityId: string): Promise<{ summary: string; commentCount: number }> {
    // Проверяем кэш
    const cached = this.summaryCache.get(entityId);
    if (cached && cached.expiresAt > Date.now()) {
      const count = await this.commentRepository.count({ where: { entityId } });
      return { summary: cached.summary, commentCount: count };
    }

    if (!this.providerRegistry.isCompletionAvailable()) {
      throw new Error('AI провайдеры недоступны');
    }

    const comments = await this.commentRepository.find({
      where: { entityId },
      order: { createdAt: 'ASC' },
      take: 50,
      relations: ['author'],
    });

    if (comments.length < 3) {
      throw new Error('Недостаточно комментариев для резюме');
    }

    const entity = await this.entityRepository.findOne({ where: { id: entityId } });
    const title = entity?.title || 'Без темы';

    const conversation = comments.map((c) => {
      const author = c.author
        ? `${c.author.firstName} ${c.author.lastName}`
        : 'Неизвестный';
      return `[${author}]: ${c.content.substring(0, 300)}`;
    }).join('\n');

    const result = await this.providerRegistry.complete({
      messages: [{
        role: 'user',
        content: `Кратко резюмируй переписку по заявке "${title}" (${comments.length} сообщений).
Выдели: ключевую проблему, текущий статус, и что требуется дальше.
Ответ на русском, 2-4 предложения.

ПЕРЕПИСКА:
${conversation}`,
      }],
      temperature: 0.3,
      maxTokens: 300,
    });

    // Кэшируем
    this.summaryCache.set(entityId, {
      summary: result.content,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return { summary: result.content, commentCount: comments.length };
  }

  /**
   * Анализ настроения последнего комментария
   */
  async analyzeSentiment(entityId: string): Promise<{
    label: string;
    emoji: string;
    score: number;
  } | null> {
    if (!this.providerRegistry.isCompletionAvailable()) {
      return null;
    }

    // Получаем последний комментарий
    const lastComment = await this.commentRepository.findOne({
      where: { entityId },
      order: { createdAt: 'DESC' },
    });

    if (!lastComment || lastComment.content.length < 10) {
      return null;
    }

    try {
      const result = await this.providerRegistry.complete({
        messages: [{
          role: 'user',
          content: `Определи настроение клиента по сообщению. Ответь строго в JSON формате:
{"label":"одно_из: satisfied|neutral|concerned|frustrated|urgent","score":0.0-1.0}

Сообщение: "${lastComment.content.substring(0, 500)}"`,
        }],
        temperature: 0,
        maxTokens: 50,
        jsonMode: true,
      });

      const parsed = JSON.parse(extractJson(result.content));
      const emojiMap: Record<string, string> = {
        satisfied: '😊',
        neutral: '😐',
        concerned: '😟',
        frustrated: '😤',
        urgent: '🚨',
      };

      return {
        label: parsed.label || 'neutral',
        emoji: emojiMap[parsed.label] || '😐',
        score: parsed.score || 0.5,
      };
    } catch (error) {
      this.logger.warn(`Ошибка анализа настроения: ${error.message}`);
      return null;
    }
  }
}
