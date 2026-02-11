import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseLlmProvider,
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbeddingResult,
} from './base-llm.provider';

interface GroqChatResponse {
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
 * Провайдер для Groq API (бесплатный tier с быстрым inference)
 *
 * Особенности:
 * - Бесплатно: 14,400 requests/day для Llama 3.1 70B
 * - Очень быстрый: ~500 tokens/sec
 * - Не поддерживает embeddings (используйте Ollama или OpenAI)
 *
 * Регистрация: https://console.groq.com/
 */
@Injectable()
export class GroqProvider extends BaseLlmProvider {
  private readonly logger = new Logger(GroqProvider.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://api.groq.com/openai/v1';
  private readonly model: string;

  readonly name = 'groq';

  constructor(private readonly configService: ConfigService) {
    super();

    this.apiKey = this.configService.get<string>('GROQ_API_KEY');
    this.model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';

    if (this.apiKey) {
      this.logger.log(`Groq провайдер инициализирован (model: ${this.model})`);
    } else {
      this.logger.warn('Groq API key не настроен');
    }
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    if (!this.apiKey) {
      throw new Error('Groq не настроен');
    }

    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq ошибка: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as GroqChatResponse;

    this.logger.debug(
      `Groq completion: ${Date.now() - startTime}ms, model: ${data.model}, tokens: ${data.usage.total_tokens}`,
    );

    return {
      content: data.choices[0]?.message?.content || '',
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      model: data.model,
    };
  }

  async *completeStream(options: LlmCompletionOptions): AsyncGenerator<string> {
    if (!this.apiKey) {
      throw new Error('Groq не настроен');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq streaming ошибка: ${response.status} - ${errorText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          if (trimmed === 'data: [DONE]') return;

          const data = JSON.parse(trimmed.slice(6));
          const content = data.choices?.[0]?.delta?.content;
          if (content) yield content;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Groq не поддерживает embeddings
   * Используйте Ollama или OpenAI для embeddings
   */
  async embed(_text: string): Promise<LlmEmbeddingResult> {
    throw new Error('Groq не поддерживает embeddings. Используйте Ollama или OpenAI.');
  }

  /**
   * Проверяет лимиты API
   */
  async checkRateLimits(): Promise<{
    requestsRemaining: number;
    tokensRemaining: number;
    resetAt: Date;
  } | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      // Делаем минимальный запрос для проверки лимитов
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
      });

      // Groq возвращает rate limit info в headers
      const requestsRemaining = parseInt(
        response.headers.get('x-ratelimit-remaining-requests') || '0',
        10,
      );
      const tokensRemaining = parseInt(
        response.headers.get('x-ratelimit-remaining-tokens') || '0',
        10,
      );
      const resetTimestamp = response.headers.get('x-ratelimit-reset-requests');
      const resetAt = resetTimestamp ? new Date(resetTimestamp) : new Date();

      return { requestsRemaining, tokensRemaining, resetAt };
    } catch {
      return null;
    }
  }

  /**
   * Получает список доступных моделей
   */
  async listModels(): Promise<string[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.data?.map((m: { id: string }) => m.id) || [];
      }
    } catch {
      // Игнорируем
    }

    return [];
  }
}
