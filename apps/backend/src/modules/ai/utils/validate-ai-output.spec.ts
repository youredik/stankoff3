import { validateAiOutput } from './validate-ai-output';
import { ClassificationSchema, SentimentSchema } from './ai-schemas';

describe('validateAiOutput', () => {
  describe('ClassificationSchema', () => {
    it('должен распарсить валидный JSON', async () => {
      const result = await validateAiOutput({
        rawOutput: JSON.stringify({
          category: 'technical_support',
          priority: 'high',
          skills: ['mechanical', 'electrical'],
          confidence: 0.85,
          reasoning: 'Станок не работает',
        }),
        schema: ClassificationSchema,
      });

      expect(result.category).toBe('technical_support');
      expect(result.priority).toBe('high');
      expect(result.skills).toEqual(['mechanical', 'electrical']);
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('Станок не работает');
    });

    it('должен распарсить JSON в markdown-обёртке', async () => {
      const result = await validateAiOutput({
        rawOutput: '```json\n{"category":"consultation","priority":"low","skills":[],"confidence":0.9,"reasoning":"вопрос"}\n```',
        schema: ClassificationSchema,
      });

      expect(result.category).toBe('consultation');
      expect(result.priority).toBe('low');
    });

    it('должен вернуть catch-defaults при невалидных значениях полей', async () => {
      const result = await validateAiOutput({
        rawOutput: JSON.stringify({
          category: 'unknown_category',
          priority: 'super_high',
          skills: 'not_an_array',
          confidence: 2.5,
          reasoning: 123,
        }),
        schema: ClassificationSchema,
      });

      expect(result.category).toBe('other');
      expect(result.priority).toBe('medium');
      expect(result.skills).toEqual([]);
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toBe('');
    });

    it('должен вернуть defaults при полностью невалидном JSON без retry', async () => {
      const result = await validateAiOutput({
        rawOutput: 'not a json at all',
        schema: ClassificationSchema,
      });

      expect(result.category).toBe('other');
      expect(result.priority).toBe('medium');
      expect(result.skills).toEqual([]);
      expect(result.confidence).toBe(0.5);
    });

    it('должен вызвать retry при невалидном JSON', async () => {
      const retryFn = jest.fn().mockResolvedValue(
        JSON.stringify({
          category: 'spare_parts',
          priority: 'medium',
          skills: ['logistics'],
          confidence: 0.7,
          reasoning: 'запчасти',
        }),
      );

      const result = await validateAiOutput({
        rawOutput: 'broken json',
        schema: ClassificationSchema,
        retryFn,
        maxRetries: 1,
      });

      expect(retryFn).toHaveBeenCalledTimes(1);
      expect(result.category).toBe('spare_parts');
    });

    it('должен вернуть defaults если все retry неудачны', async () => {
      const retryFn = jest.fn().mockResolvedValue('still broken');

      const result = await validateAiOutput({
        rawOutput: 'broken',
        schema: ClassificationSchema,
        retryFn,
        maxRetries: 2,
      });

      expect(retryFn).toHaveBeenCalledTimes(2);
      expect(result.category).toBe('other');
      expect(result.priority).toBe('medium');
    });

    it('должен заполнить отсутствующие поля catch-defaults', async () => {
      const result = await validateAiOutput({
        rawOutput: JSON.stringify({ category: 'reclamation' }),
        schema: ClassificationSchema,
      });

      expect(result.category).toBe('reclamation');
      expect(result.priority).toBe('medium');
      expect(result.skills).toEqual([]);
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toBe('');
    });
  });

  describe('SentimentSchema', () => {
    it('должен распарсить валидный sentiment', async () => {
      const result = await validateAiOutput({
        rawOutput: JSON.stringify({ label: 'frustrated', score: 0.8 }),
        schema: SentimentSchema,
      });

      expect(result.label).toBe('frustrated');
      expect(result.score).toBe(0.8);
    });

    it('должен вернуть neutral defaults при невалидном label', async () => {
      const result = await validateAiOutput({
        rawOutput: JSON.stringify({ label: 'angry', score: 0.9 }),
        schema: SentimentSchema,
      });

      expect(result.label).toBe('neutral');
      expect(result.score).toBe(0.9);
    });

    it('должен обработать пустой объект', async () => {
      const result = await validateAiOutput({
        rawOutput: '{}',
        schema: SentimentSchema,
      });

      expect(result.label).toBe('neutral');
      expect(result.score).toBe(0.5);
    });
  });
});
