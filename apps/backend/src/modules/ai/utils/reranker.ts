/**
 * Lightweight reranker для переранжирования результатов RAG-поиска.
 * Чисто алгоритмический, без LLM/API — добавляет <1ms latency.
 */

export interface RankableChunk {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  similarity: number;
  textRank?: number;
}

export interface RerankedChunk extends RankableChunk {
  rerankScore: number;
}

/**
 * Переранжирует результаты search_hybrid_chunks по дополнительным сигналам:
 * - keyword overlap с запросом (+0.15 max)
 * - subject match (+0.1 max)
 * - наличие closedAt (+0.05)
 * - freshness decay (+0.05 max)
 * - responseCount >= 3 (+0.03)
 */
export function rerankResults(
  results: RankableChunk[],
  query: string,
  topK: number = 5,
): RerankedChunk[] {
  if (results.length === 0) return [];

  const queryTokens = tokenize(query);

  const scored = results.map((result): RerankedChunk => {
    let score = result.similarity; // base: vector similarity

    const metadata = result.metadata || {};

    // 1. Keyword overlap boost (0-0.15)
    const contentTokens = tokenize(result.content.substring(0, 1000)); // первые 1000 символов
    const overlap = countOverlap(queryTokens, contentTokens);
    const overlapRatio = queryTokens.size > 0 ? overlap / queryTokens.size : 0;
    score += overlapRatio * 0.15;

    // 2. Subject match boost (0-0.1)
    const subjectTokens = tokenize(String(metadata.subject || ''));
    const subjectOverlap = countOverlap(queryTokens, subjectTokens);
    const subjectRatio = queryTokens.size > 0 ? subjectOverlap / queryTokens.size : 0;
    score += subjectRatio * 0.1;

    // 3. Resolution presence boost (0.05)
    if (metadata.closedAt) {
      score += 0.05;
    }

    // 4. Freshness boost (0-0.05): decay over 5 years
    if (metadata.closedAt) {
      const closedAt = new Date(metadata.closedAt as string).getTime();
      if (!isNaN(closedAt)) {
        const ageMs = Date.now() - closedAt;
        const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
        score += Math.max(0, 0.05 * (1 - ageMs / fiveYearsMs));
      }
    }

    // 5. Response count boost (0.03)
    const responseCount = (metadata.responseCount as number) || 0;
    if (responseCount >= 3) {
      score += 0.03;
    }

    return { ...result, rerankScore: score };
  });

  return scored
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}

/**
 * Простая токенизация: lowercase слова >= 3 символов.
 * Поддерживает русский и английский.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\wа-яёА-ЯЁ\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3),
  );
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count++;
  }
  return count;
}
