import { z } from 'zod';

/**
 * Zod-схемы для валидации AI outputs.
 * Используют .catch() — при невалидном поле возвращается fallback, не ошибка.
 */

// Схема для классификации заявки
export const ClassificationSchema = z.object({
  category: z
    .enum([
      'technical_support',
      'reclamation',
      'consultation',
      'spare_parts',
      'installation',
      'other',
    ])
    .catch('other'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).catch('medium'),
  skills: z
    .array(z.string())
    .catch([]),
  confidence: z.number().min(0).max(1).catch(0.5),
  reasoning: z.string().catch(''),
});

export type ClassificationOutput = z.infer<typeof ClassificationSchema>;

// Схема для sentiment analysis
export const SentimentSchema = z.object({
  label: z
    .enum(['satisfied', 'neutral', 'concerned', 'frustrated', 'urgent'])
    .catch('neutral'),
  score: z.number().min(0).max(1).catch(0.5),
});

export type SentimentOutput = z.infer<typeof SentimentSchema>;
