import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseLlmProvider,
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbeddingResult,
} from './base-llm.provider';

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Провайдер для Ollama (локальные модели)
 *
 * Поддерживает:
 * - LLM: llama3.1, qwen2.5, mistral-nemo, и др.
 * - Embeddings: nomic-embed-text, mxbai-embed-large
 *
 * Установка: https://ollama.com/
 * Запуск: ollama serve
 */
@Injectable()
export class OllamaProvider extends BaseLlmProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimension: number;
  private isAvailable = false;

  readonly name = 'ollama';

  constructor(private readonly configService: ConfigService) {
    super();

    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
    this.model = this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5:14b';
    this.embeddingModel = this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') || 'nomic-embed-text';
    this.embeddingDimension = parseInt(
      this.configService.get<string>('OLLAMA_EMBEDDING_DIMENSION') || '768',
      10,
    );

    // Проверяем доступность при старте
    this.checkAvailability();
  }

  get isConfigured(): boolean {
    return this.isAvailable;
  }

  /**
   * Проверяет доступность Ollama
   */
  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const modelNames = data.models?.map((m: { name: string }) => m.name) || [];
        this.isAvailable = true;
        this.logger.log(
          `Ollama доступен (${this.baseUrl}), модели: ${modelNames.slice(0, 5).join(', ')}${modelNames.length > 5 ? '...' : ''}`,
        );
      } else {
        this.isAvailable = false;
        this.logger.warn(`Ollama недоступен: ${response.status}`);
      }
    } catch (error) {
      this.isAvailable = false;
      this.logger.warn(`Ollama недоступен: ${error}`);
    }
  }

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    if (!this.isAvailable) {
      throw new Error('Ollama недоступен');
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 1000,
          },
          format: options.jsonMode ? 'json' : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama ошибка: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as OllamaChatResponse;

      this.logger.debug(
        `Ollama completion: ${Date.now() - startTime}ms, model: ${data.model}`,
      );

      return {
        content: data.message.content,
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        model: data.model,
      };
    } catch (error) {
      // Помечаем как недоступный при ошибке соединения
      if (error instanceof TypeError && error.message.includes('fetch')) {
        this.isAvailable = false;
      }
      throw error;
    }
  }

  async embed(text: string): Promise<LlmEmbeddingResult> {
    if (!this.isAvailable) {
      throw new Error('Ollama недоступен');
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embeddings ошибка: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;

      // Ollama возвращает embeddings в поле "embedding"
      let embedding = data.embedding;

      // Если нужно подогнать размерность (например, для совместимости с OpenAI 1536)
      const targetDimension = parseInt(
        this.configService.get<string>('AI_EMBEDDING_DIMENSION') || '1536',
        10,
      );

      if (embedding.length < targetDimension) {
        // Дополняем нулями для совместимости с существующей БД
        embedding = [...embedding, ...new Array(targetDimension - embedding.length).fill(0)];
      } else if (embedding.length > targetDimension) {
        // Обрезаем если больше
        embedding = embedding.slice(0, targetDimension);
      }

      this.logger.debug(
        `Ollama embedding: ${Date.now() - startTime}ms, dim: ${data.embedding.length} → ${embedding.length}`,
      );

      return {
        embedding,
        inputTokens: Math.ceil(text.length / 4), // Примерная оценка токенов
        model: this.embeddingModel,
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        this.isAvailable = false;
      }
      throw error;
    }
  }

  /**
   * Загружает модель в память (pull + warm up)
   */
  async warmupModel(modelName?: string): Promise<void> {
    const model = modelName || this.model;

    try {
      // Проверяем, загружена ли модель
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: 'Hello',
          stream: false,
          options: { num_predict: 1 },
        }),
      });

      if (response.ok) {
        this.logger.log(`Модель ${model} готова к работе`);
      }
    } catch (error) {
      this.logger.warn(`Не удалось прогреть модель ${model}: ${error}`);
    }
  }

  /**
   * Получает список доступных моделей
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        return data.models?.map((m: { name: string }) => m.name) || [];
      }
    } catch {
      // Игнорируем
    }
    return [];
  }
}
