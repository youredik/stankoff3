/**
 * Базовый интерфейс для LLM провайдеров
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface LlmEmbeddingResult {
  embedding: number[];
  inputTokens: number;
  model: string;
}

export abstract class BaseLlmProvider {
  abstract readonly name: string;
  abstract readonly isConfigured: boolean;

  abstract complete(options: LlmCompletionOptions): Promise<LlmCompletionResult>;
  abstract embed(text: string): Promise<LlmEmbeddingResult>;
}
