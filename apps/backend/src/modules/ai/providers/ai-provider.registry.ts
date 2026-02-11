import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseLlmProvider,
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbeddingResult,
} from './base-llm.provider';
import { OllamaProvider } from './ollama.provider';
import { GroqProvider } from './groq.provider';
import { OpenAiProvider } from './openai.provider';
import { YandexCloudProvider } from './yandex-cloud.provider';

export type ProviderName = 'ollama' | 'groq' | 'openai' | 'yandex';

interface ProviderConfig {
  name: ProviderName;
  priority: number;
  supportsEmbeddings: boolean;
  supportsCompletion: boolean;
  isFree: boolean;
}

/**
 * Реестр AI провайдеров с приоритетами и fallback
 *
 * Стратегия по умолчанию:
 * - Embeddings: Yandex (облако, 256 dims) → Ollama (локально) → OpenAI (платно, fallback)
 * - Completions: Yandex (облако, YandexGPT) → Ollama (локально) → Groq (облако) → OpenAI (платно)
 *
 * Настраивается через переменные окружения:
 * - AI_LLM_PRIORITY: yandex,ollama,groq,openai (порядок для LLM)
 * - AI_EMBEDDING_PRIORITY: ollama,openai (порядок для embeddings)
 */
@Injectable()
export class AiProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(AiProviderRegistry.name);
  private readonly providers = new Map<ProviderName, BaseLlmProvider>();

  private readonly providerConfigs: ProviderConfig[] = [
    { name: 'yandex', priority: 0, supportsEmbeddings: true, supportsCompletion: true, isFree: false },
    { name: 'ollama', priority: 1, supportsEmbeddings: true, supportsCompletion: true, isFree: true },
    { name: 'groq', priority: 2, supportsEmbeddings: false, supportsCompletion: true, isFree: true },
    { name: 'openai', priority: 3, supportsEmbeddings: true, supportsCompletion: true, isFree: false },
  ];

  private llmPriority: ProviderName[] = [];
  private embeddingPriority: ProviderName[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly groqProvider: GroqProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly yandexCloudProvider: YandexCloudProvider,
  ) {
    // Регистрируем провайдеры
    this.providers.set('yandex', yandexCloudProvider);
    this.providers.set('ollama', ollamaProvider);
    this.providers.set('groq', groqProvider);
    this.providers.set('openai', openAiProvider);

    // Парсим приоритеты из конфига
    this.llmPriority = this.parsePriority(
      this.configService.get<string>('AI_LLM_PRIORITY') || 'yandex,ollama,groq,openai',
    );
    this.embeddingPriority = this.parsePriority(
      this.configService.get<string>('AI_EMBEDDING_PRIORITY') || 'yandex,ollama,openai',
    );
  }

  async onModuleInit(): Promise<void> {
    // Ollama проверяет доступность асинхронно — ждём перед логированием
    await this.ollamaProvider.checkAvailability();
    this.logStatus();
  }

  /**
   * Логирует статус всех провайдеров
   */
  private logStatus(): void {
    const available: string[] = [];
    const unavailable: string[] = [];

    for (const [name, provider] of this.providers) {
      if (provider.isConfigured) {
        available.push(name);
      } else {
        unavailable.push(name);
      }
    }

    this.logger.log(
      `AI провайдеры: доступны [${available.join(', ')}], недоступны [${unavailable.join(', ')}]`,
    );
    this.logger.log(`Приоритет LLM: ${this.llmPriority.join(' → ')}`);
    this.logger.log(`Приоритет Embeddings: ${this.embeddingPriority.join(' → ')}`);
  }

  /**
   * Парсит строку приоритетов
   */
  private parsePriority(value: string): ProviderName[] {
    return value
      .split(',')
      .map((s) => s.trim().toLowerCase() as ProviderName)
      .filter((name) => this.providers.has(name));
  }

  /**
   * Проверяет, доступен ли хотя бы один провайдер для completions
   */
  isCompletionAvailable(): boolean {
    return this.llmPriority.some((name) => {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);
      return provider?.isConfigured && config?.supportsCompletion;
    });
  }

  /**
   * Проверяет, доступен ли хотя бы один провайдер для embeddings
   */
  isEmbeddingAvailable(): boolean {
    return this.embeddingPriority.some((name) => {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);
      return provider?.isConfigured && config?.supportsEmbeddings;
    });
  }

  /**
   * Проверяет, доступен ли AI в целом
   */
  isAvailable(): boolean {
    return this.isCompletionAvailable() || this.isEmbeddingAvailable();
  }

  /**
   * Получает первый доступный провайдер для completions
   */
  getCompletionProvider(): BaseLlmProvider | null {
    for (const name of this.llmPriority) {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);
      if (provider?.isConfigured && config?.supportsCompletion) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Получает первый доступный провайдер для embeddings
   */
  getEmbeddingProvider(): BaseLlmProvider | null {
    for (const name of this.embeddingPriority) {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);
      if (provider?.isConfigured && config?.supportsEmbeddings) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Выполняет completion с fallback
   */
  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult & { provider: string }> {
    const errors: string[] = [];

    for (const name of this.llmPriority) {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);

      if (!provider?.isConfigured || !config?.supportsCompletion) {
        continue;
      }

      try {
        const result = await provider.complete(options);
        return { ...result, provider: name };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${errorMsg}`);
        this.logger.warn(`Провайдер ${name} недоступен: ${errorMsg}`);
      }
    }

    throw new Error(`Все AI провайдеры недоступны. Ошибки: ${errors.join('; ')}`);
  }

  /**
   * Выполняет streaming completion с fallback
   */
  async *completeStream(options: LlmCompletionOptions): AsyncGenerator<string> {
    const errors: string[] = [];

    for (const name of this.llmPriority) {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);

      if (!provider?.isConfigured || !config?.supportsCompletion) {
        continue;
      }

      try {
        yield* provider.completeStream(options);
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${errorMsg}`);
        this.logger.warn(`Провайдер ${name} streaming недоступен: ${errorMsg}`);
      }
    }

    throw new Error(`Все AI провайдеры недоступны для streaming. Ошибки: ${errors.join('; ')}`);
  }

  /**
   * Генерирует embeddings с fallback
   */
  async embed(text: string): Promise<LlmEmbeddingResult & { provider: string }> {
    const errors: string[] = [];

    for (const name of this.embeddingPriority) {
      const provider = this.providers.get(name);
      const config = this.providerConfigs.find((c) => c.name === name);

      if (!provider?.isConfigured || !config?.supportsEmbeddings) {
        continue;
      }

      try {
        const result = await provider.embed(text);
        return { ...result, provider: name };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${errorMsg}`);
        this.logger.warn(`Провайдер ${name} недоступен для embeddings: ${errorMsg}`);
      }
    }

    throw new Error(`Нет доступных провайдеров для embeddings. Ошибки: ${errors.join('; ')}`);
  }

  /**
   * Получает информацию о провайдерах
   */
  getProvidersInfo(): Array<{
    name: ProviderName;
    isConfigured: boolean;
    isFree: boolean;
    supportsEmbeddings: boolean;
    supportsCompletion: boolean;
  }> {
    return this.providerConfigs.map((config) => ({
      name: config.name,
      isConfigured: this.providers.get(config.name)?.isConfigured || false,
      isFree: config.isFree,
      supportsEmbeddings: config.supportsEmbeddings,
      supportsCompletion: config.supportsCompletion,
    }));
  }

  /**
   * Получает провайдер по имени
   */
  getProvider(name: ProviderName): BaseLlmProvider | null {
    return this.providers.get(name) || null;
  }
}
