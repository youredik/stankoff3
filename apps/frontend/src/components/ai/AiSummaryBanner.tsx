'use client';

import { useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useAiStore } from '@/store/useAiStore';

interface AiSummaryBannerProps {
  entityId: string;
  commentCount: number;
}

/**
 * Компактный баннер с AI-резюме переписки
 * Показывается когда комментариев >= 5
 */
export function AiSummaryBanner({ entityId, commentCount }: AiSummaryBannerProps) {
  const summary = useAiStore((s) => s.summaryCache.get(entityId) ?? null);
  const loading = useAiStore((s) => s.summaryLoading.get(entityId) ?? false);
  const fetchSummary = useAiStore((s) => s.fetchSummary);

  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (commentCount >= 5) {
      fetchSummary(entityId);
    }
  }, [entityId, commentCount, fetchSummary]);

  // Не показываем если мало комментариев или нет данных
  if (commentCount < 5) return null;
  if (!loading && !summary) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="font-medium text-amber-700 dark:text-amber-300">
          Резюме ({commentCount} сообщений)
        </span>
        <span className="flex-1" />
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-1 px-3 py-2 bg-amber-50/50 dark:bg-amber-900/10 rounded-b-lg border border-t-0 border-amber-200 dark:border-amber-800">
          {loading ? (
            <div className="space-y-1.5">
              <div className="h-3 bg-amber-200 dark:bg-amber-800 rounded animate-pulse w-full" />
              <div className="h-3 bg-amber-200 dark:bg-amber-800 rounded animate-pulse w-4/5" />
            </div>
          ) : summary ? (
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
              {summary.summary}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
