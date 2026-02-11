import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseLlmProvider,
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbeddingResult,
} from './base-llm.provider';

interface YandexChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Провайдер для Yandex Cloud Foundation Models (YandexGPT)
 *
 * Использует OpenAI-совместимый REST API с авторизацией Api-Key.
 *
 * Преимущества:
 * - Нет гео-блокировки (сервер в Yandex Cloud)
 * - Серверная модель (0 ГБ RAM на сервере)
 * - Нативная поддержка русского языка
 *
 * Env:
 * - YANDEX_CLOUD_API_KEY — API ключ сервисного аккаунта
 * - YANDEX_CLOUD_FOLDER_ID — ID каталога Yandex Cloud
 * - YANDEX_CLOUD_MODEL — модель (default: yandexgpt-lite/latest)
 */
@Injectable()
export class YandexCloudProvider extends BaseLlmProvider {
  private readonly logger = new Logger(YandexCloudProvider.name);
  private readonly apiKey: string | undefined;
  private readonly folderId: string | undefined;
  private readonly baseUrl = 'https://llm.api.cloud.yandex.net/foundationModels/v1';
  private readonly model: string;

  readonly name = 'yandex';

  constructor(private readonly configService: ConfigService) {
    super();

    this.apiKey = this.configService.get<string>('YANDEX_CLOUD_API_KEY');
    this.folderId = this.configService.get<string>('YANDEX_CLOUD_FOLDER_ID');
    this.model = this.configService.get<string>('YANDEX_CLOUD_MODEL') || 'yandexgpt-lite/latest';

    if (this.apiKey && this.folderId) {
      this.logger.log(`Yandex Cloud провайдер инициализирован (model: ${this.model}, folder: ${this.folderId})`);
    } else {
      if (!this.apiKey) this.logger.warn('YANDEX_CLOUD_API_KEY не настроен');
      if (!this.folderId) this.logger.warn('YANDEX_CLOUD_FOLDER_ID не настроен');
    }
  }

  get isConfigured(): boolean {
    return !!this.apiKey && !!this.folderId;
  }

  private get modelUri(): string {
    return `gpt://${this.folderId}/${this.model}`;
  }

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    if (!this.apiKey || !this.folderId) {
      throw new Error('Yandex Cloud не настроен');
    }

    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${this.apiKey}`,
        'x-folder-id': this.folderId,
      },
      body: JSON.stringify({
        modelUri: this.modelUri,
        completionOptions: {
          stream: false,
          temperature: options.temperature ?? 0.7,
          maxTokens: String(options.maxTokens ?? 1000),
        },
        messages: options.messages.map((m) => ({
          role: m.role,
          text: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yandex Cloud ошибка: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const result = data.result || data;
    const alternatives = result.alternatives || [];
    const content = alternatives[0]?.message?.text || '';
    const usage = result.usage || {};

    this.logger.debug(
      `Yandex Cloud completion: ${Date.now() - startTime}ms, model: ${this.model}, tokens: ${(usage.inputTextTokens || 0) + (usage.completionTokens || 0)}`,
    );

    return {
      content,
      inputTokens: parseInt(usage.inputTextTokens || '0', 10),
      outputTokens: parseInt(usage.completionTokens || '0', 10),
      model: result.modelVersion ? `${this.model}@${result.modelVersion}` : this.model,
    };
  }

  async *completeStream(options: LlmCompletionOptions): AsyncGenerator<string> {
    if (!this.apiKey || !this.folderId) {
      throw new Error('Yandex Cloud не настроен');
    }

    const response = await fetch(`${this.baseUrl}/completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${this.apiKey}`,
        'x-folder-id': this.folderId,
      },
      body: JSON.stringify({
        modelUri: this.modelUri,
        completionOptions: {
          stream: true,
          temperature: options.temperature ?? 0.7,
          maxTokens: String(options.maxTokens ?? 1000),
        },
        messages: options.messages.map((m) => ({
          role: m.role,
          text: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yandex Cloud streaming ошибка: ${response.status} - ${errorText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let previousText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const data = JSON.parse(trimmed);
            const result = data.result || data;
            const alternatives = result.alternatives || [];
            const currentText = alternatives[0]?.message?.text || '';

            // Yandex streaming возвращает полный текст, а не дельту
            if (currentText.length > previousText.length) {
              const delta = currentText.slice(previousText.length);
              previousText = currentText;
              yield delta;
            }
          } catch {
            // Пропускаем невалидные строки
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Yandex Cloud embeddings несовместимы с текущей БД (256 dims vs 768)
   * Используйте Ollama для embeddings
   */
  async embed(_text: string): Promise<LlmEmbeddingResult> {
    throw new Error('Yandex Cloud embeddings несовместимы (256 dims vs 768 в БД). Используйте Ollama.');
  }
}
