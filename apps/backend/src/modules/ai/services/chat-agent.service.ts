import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { User } from '../../user/user.entity';

const AI_BOT_EMAIL = 'ai-assistant@stankoff.ru';
const MAX_CONTEXT_MESSAGES = 10;

const SYSTEM_PROMPT = `Ты — AI-ассистент компании "Станкофф", специализирующейся на промышленном оборудовании (станки, ЧПУ, гидравлика, пневматика, лазеры, сварка).
Ты помогаешь сотрудникам в корпоративном мессенджере: ищешь информацию в базе знаний, отвечаешь на вопросы, помогаешь с заявками клиентов.

ВОЗМОЖНОСТИ:
- Поиск по базе знаний (358K+ legacy заявок с решениями)
- Помощь с ответами клиентам на основе решённых случаев
- Рекомендации экспертов по конкретным темам
- Общие вопросы по промышленному оборудованию

ПРАВИЛА:
1. Отвечай на русском языке
2. Будь кратким и конкретным
3. Если находишь похожие случаи — указывай номера заявок
4. Если не знаешь ответ — честно скажи, не выдумывай
5. Используй маркированные списки для структурирования
6. При рекомендации экспертов — указывай имя и отдел`;

interface ChatContext {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);
  private botUserId: string | null = null;
  private readonly processingChats = new Map<string, Promise<void>>();

  constructor(
    private readonly providerRegistry: AiProviderRegistry,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    @InjectRepository(AiUsageLog)
    private readonly usageLogRepo: Repository<AiUsageLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Получить или создать системного пользователя для AI-бота
   */
  async getBotUserId(): Promise<string> {
    if (this.botUserId) return this.botUserId;

    let botUser = await this.userRepo.findOne({
      where: { email: AI_BOT_EMAIL },
    });

    if (!botUser) {
      botUser = this.userRepo.create({
        email: AI_BOT_EMAIL,
        firstName: 'AI',
        lastName: 'Ассистент',
        password: 'disabled-no-login',
        isActive: false,
      });
      botUser = await this.userRepo.save(botUser);
      this.logger.log(`Создан системный пользователь AI-бота: ${botUser.id}`);
    }

    this.botUserId = botUser.id;
    return this.botUserId;
  }

  /**
   * Проверяет, является ли пользователь AI-ботом
   */
  async isBotUser(userId: string): Promise<boolean> {
    const botId = await this.getBotUserId();
    return userId === botId;
  }

  /**
   * Главный метод: обработка сообщения пользователя в AI-чате
   */
  async processMessage(
    conversationId: string,
    messageContent: string,
    userId: string,
    previousMessages?: ChatContext[],
  ): Promise<string> {
    // Последовательная обработка для одного чата
    const existing = this.processingChats.get(conversationId);
    if (existing) {
      await existing;
    }

    const processing = this.doProcessMessage(
      conversationId,
      messageContent,
      userId,
      previousMessages,
    );
    this.processingChats.set(conversationId, processing.then(() => {}));

    try {
      return await processing;
    } finally {
      this.processingChats.delete(conversationId);
    }
  }

  private async doProcessMessage(
    conversationId: string,
    messageContent: string,
    _userId: string,
    previousMessages?: ChatContext[],
  ): Promise<string> {
    if (!this.providerRegistry.isCompletionAvailable()) {
      return 'AI-сервис временно недоступен. Попробуйте позже.';
    }

    const startTime = Date.now();
    const cleanContent = this.stripHtml(messageContent);

    try {
      // 1. Поиск в базе знаний для контекста
      let ragContext = '';
      if (this.knowledgeBaseService.isAvailable() && cleanContent.length >= 10) {
        try {
          const searchResults = await this.knowledgeBaseService.searchSimilar({
            query: cleanContent,
            sourceType: 'legacy_request',
            limit: 5,
            minSimilarity: 0.5,
          });

          if (searchResults.length > 0) {
            ragContext = this.formatRagContext(searchResults);
          }
        } catch (e) {
          this.logger.warn(`RAG search failed: ${e instanceof Error ? e.message : e}`);
        }
      }

      // 2. Формируем промпт
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      // Добавляем контекст беседы (последние N сообщений)
      if (previousMessages && previousMessages.length > 0) {
        const recent = previousMessages.slice(-MAX_CONTEXT_MESSAGES);
        for (const msg of recent) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Текущее сообщение с RAG-контекстом
      let userMessage = cleanContent;
      if (ragContext) {
        userMessage = `${cleanContent}\n\n---\nКОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ (используй если релевантно):\n${ragContext}`;
      }
      messages.push({ role: 'user', content: userMessage });

      // 3. Вызов LLM
      const result = await this.providerRegistry.complete({
        messages,
        temperature: 0.7,
        maxTokens: 1500,
      });

      const latencyMs = Date.now() - startTime;

      // 4. Логируем использование
      await this.logUsage(
        result.provider,
        result.model,
        result.inputTokens,
        result.outputTokens,
        latencyMs,
        true,
      );

      return result.content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Chat agent error: ${errorMsg}`);

      await this.logUsage('unknown', 'unknown', 0, 0, Date.now() - startTime, false, errorMsg);

      return 'Произошла ошибка при обработке запроса. Попробуйте переформулировать вопрос.';
    }
  }

  /**
   * Форматирует результаты RAG для контекста
   */
  private formatRagContext(results: Array<{ content: string; similarity: number; metadata: Record<string, unknown> }>): string {
    return results
      .slice(0, 3)
      .map((r, i) => {
        const meta = r.metadata || {};
        const requestId = meta.requestId;
        const subject = meta.subject || 'Без темы';
        const similarity = Math.round(r.similarity * 100);
        return `[${i + 1}] Заявка #${requestId} (${similarity}% совпадение) — ${subject}\n${r.content.substring(0, 400)}`;
      })
      .join('\n\n');
  }

  /**
   * Убирает HTML-теги из контента сообщений
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private async logUsage(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    success: boolean,
    error?: string,
  ): Promise<void> {
    try {
      const log = this.usageLogRepo.create({
        provider: provider as any,
        model,
        operation: 'chat' as const,
        inputTokens,
        outputTokens,
        latencyMs,
        success,
        error: error || undefined,
      });
      await this.usageLogRepo.save(log);
    } catch {
      // не критично
    }
  }
}
