import { z } from 'zod';
import { extractJson } from './extract-json';

export interface ValidateOptions<T> {
  /** Raw LLM output string */
  rawOutput: string;
  /** Zod schema for validation */
  schema: z.ZodSchema<T>;
  /** Function to call LLM for retry (receives error description) */
  retryFn?: (errorDescription: string) => Promise<string>;
  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;
}

/**
 * Валидирует AI output через zod-схему.
 * При невалидном JSON — retry через retryFn (если задана).
 * При исчерпании retry — возвращает safe defaults из .catch() в схеме.
 */
export async function validateAiOutput<T>(options: ValidateOptions<T>): Promise<T> {
  const { rawOutput, schema, retryFn, maxRetries = 2 } = options;

  // Attempt 1: parse raw output
  const jsonStr = extractJson(rawOutput);
  try {
    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  } catch (firstError) {
    if (!retryFn || maxRetries <= 0) {
      // No retry — return safe defaults from .catch() in schema
      const safeResult = schema.safeParse({});
      if (safeResult.success) return safeResult.data;
      throw firstError;
    }
  }

  // Retry loop
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const errorDesc =
        'Предыдущий ответ не прошёл валидацию JSON. Ответь строго в JSON формате без markdown-обёртки.';
      const retryOutput = await retryFn(errorDesc);
      const retryJson = extractJson(retryOutput);
      const parsed = JSON.parse(retryJson);
      return schema.parse(parsed);
    } catch (e) {
      lastError = e;
    }
  }

  // All retries failed — return safe defaults
  const safeResult = schema.safeParse({});
  if (safeResult.success) return safeResult.data;
  throw lastError;
}
