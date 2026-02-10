import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  BaseLlmProvider,
  LlmCompletionOptions,
  LlmCompletionResult,
  LlmEmbeddingResult,
} from './base-llm.provider';

@Injectable()
export class OpenAiProvider extends BaseLlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private client: OpenAI | null = null;
  private readonly model: string;
  private readonly embeddingModel: string;

  readonly name = 'openai';

  constructor(private readonly configService: ConfigService) {
    super();

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';
    this.embeddingModel =
      this.configService.get<string>('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-large';

    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.logger.log(`OpenAI провайдер инициализирован (model: ${this.model})`);
    } else {
      this.logger.warn('OpenAI API key не настроен');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    if (!this.client) {
      throw new Error('OpenAI не настроен');
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    });

    const content = response.choices[0]?.message?.content || '';

    return {
      content,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      model: response.model,
    };
  }

  async *completeStream(options: LlmCompletionOptions): AsyncGenerator<string> {
    if (!this.client) {
      throw new Error('OpenAI не настроен');
    }

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  async embed(text: string): Promise<LlmEmbeddingResult> {
    if (!this.client) {
      throw new Error('OpenAI не настроен');
    }

    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return {
      embedding: response.data[0].embedding,
      inputTokens: response.usage?.prompt_tokens || 0,
      model: response.model,
    };
  }
}
