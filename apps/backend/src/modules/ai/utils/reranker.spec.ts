import { rerankResults, tokenize, RankableChunk } from './reranker';

describe('reranker', () => {
  const makeChunk = (overrides: Partial<RankableChunk> = {}): RankableChunk => ({
    id: 'chunk-1',
    content: 'Текст чанка про ремонт станка',
    sourceType: 'legacy_request',
    sourceId: '123',
    metadata: {},
    similarity: 0.7,
    ...overrides,
  });

  describe('rerankResults', () => {
    it('должен вернуть пустой массив для пустого input', () => {
      expect(rerankResults([], 'запрос', 5)).toEqual([]);
    });

    it('должен отсортировать по rerankScore', () => {
      const chunks = [
        makeChunk({ id: 'low', similarity: 0.5 }),
        makeChunk({ id: 'high', similarity: 0.9 }),
        makeChunk({ id: 'mid', similarity: 0.7 }),
      ];

      const result = rerankResults(chunks, 'тест', 3);

      expect(result[0].id).toBe('high');
      expect(result[1].id).toBe('mid');
      expect(result[2].id).toBe('low');
    });

    it('должен ограничить результаты topK', () => {
      const chunks = Array.from({ length: 10 }, (_, i) =>
        makeChunk({ id: `chunk-${i}`, similarity: 0.5 + i * 0.05 }),
      );

      const result = rerankResults(chunks, 'запрос', 3);
      expect(result).toHaveLength(3);
    });

    it('должен повысить score при keyword overlap', () => {
      const chunkWithMatch = makeChunk({
        id: 'match',
        content: 'Ремонт станка ЧПУ выполнен успешно',
        similarity: 0.7,
      });
      const chunkWithout = makeChunk({
        id: 'nomatch',
        content: 'Доставка товара осуществлена',
        similarity: 0.7,
      });

      const result = rerankResults(
        [chunkWithout, chunkWithMatch],
        'ремонт станка',
        2,
      );

      expect(result[0].id).toBe('match');
      expect(result[0].rerankScore).toBeGreaterThan(result[1].rerankScore);
    });

    it('должен повысить score при subject match', () => {
      const chunkWithSubject = makeChunk({
        id: 'subject-match',
        similarity: 0.7,
        metadata: { subject: 'Ремонт станка ЧПУ Fanuc' },
      });
      const chunkWithout = makeChunk({
        id: 'no-subject',
        similarity: 0.7,
        metadata: { subject: 'Заказ запчастей' },
      });

      const result = rerankResults(
        [chunkWithout, chunkWithSubject],
        'ремонт станка',
        2,
      );

      expect(result[0].id).toBe('subject-match');
    });

    it('должен повысить score для закрытых заявок', () => {
      const closed = makeChunk({
        id: 'closed',
        similarity: 0.7,
        metadata: { closedAt: new Date().toISOString() },
      });
      const open = makeChunk({
        id: 'open',
        similarity: 0.7,
        metadata: {},
      });

      const result = rerankResults([open, closed], 'тест', 2);

      expect(result[0].id).toBe('closed');
      expect(result[0].rerankScore).toBeGreaterThan(result[1].rerankScore);
    });

    it('должен повысить score для хорошо задокументированных заявок', () => {
      const documented = makeChunk({
        id: 'documented',
        similarity: 0.7,
        metadata: { responseCount: 5 },
      });
      const sparse = makeChunk({
        id: 'sparse',
        similarity: 0.7,
        metadata: { responseCount: 1 },
      });

      const result = rerankResults([sparse, documented], 'тест', 2);

      expect(result[0].id).toBe('documented');
    });

    it('должен применить freshness boost для свежих заявок', () => {
      const recent = makeChunk({
        id: 'recent',
        similarity: 0.7,
        metadata: { closedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }, // 30 дней назад
      });
      const old = makeChunk({
        id: 'old',
        similarity: 0.7,
        metadata: { closedAt: new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000).toISOString() }, // 4 года назад
      });

      const result = rerankResults([old, recent], 'тест', 2);

      expect(result[0].id).toBe('recent');
      expect(result[0].rerankScore).toBeGreaterThan(result[1].rerankScore);
    });
  });

  describe('tokenize', () => {
    it('должен токенизировать русский текст', () => {
      const tokens = tokenize('Ремонт станка ЧПУ Fanuc');
      expect(tokens.has('ремонт')).toBe(true);
      expect(tokens.has('станка')).toBe(true);
      expect(tokens.has('fanuc')).toBe(true);
    });

    it('должен отфильтровать короткие слова', () => {
      const tokens = tokenize('по на из от до');
      expect(tokens.size).toBe(0);
    });

    it('должен вернуть пустой Set для пустой строки', () => {
      expect(tokenize('').size).toBe(0);
    });

    it('должен удалить пунктуацию', () => {
      const tokens = tokenize('Привет, мир! Как дела?');
      expect(tokens.has('привет')).toBe(true);
      expect(tokens.has('дела')).toBe(true);
    });
  });
});
