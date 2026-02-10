'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Search,
  User,
  UserPlus,
  ArrowRight,
  Building2,
} from 'lucide-react';
import { useAiStore } from '@/store/useAiStore';

interface AiInsightsPanelProps {
  entityId: string;
  onShowDetails?: () => void;
  onAssignExpert?: (expertName: string, managerId?: number) => void;
}

export function AiInsightsPanel({ entityId, onShowDetails, onAssignExpert }: AiInsightsPanelProps) {
  const data = useAiStore((s) => s.assistanceCache.get(entityId)?.data ?? null);
  const loading = useAiStore((s) => s.assistanceLoading.get(entityId) ?? false);
  const fetchAssistance = useAiStore((s) => s.fetchAssistance);

  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    fetchAssistance(entityId);
  }, [entityId, fetchAssistance]);

  const handleRefresh = () => fetchAssistance(entityId, true);

  // Не рендерим если AI недоступен или нет данных
  if (!loading && (!data || !data.available)) {
    return null;
  }

  const hasContent =
    data &&
    ((data.suggestedActions && data.suggestedActions.length > 0) ||
      data.similarCases.length > 0 ||
      data.suggestedExperts.length > 0 ||
      data.relatedContext?.counterpartyName);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          AI Подсказки
        </button>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors disabled:opacity-50"
          title="Обновить"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!isExpanded && !loading && hasContent && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {data.similarCases.length > 0 &&
            `${data.similarCases.length} похож. решени${data.similarCases.length === 1 ? 'е' : data.similarCases.length < 5 ? 'я' : 'й'}`}
        </p>
      )}

      {isExpanded && (
        <div className="space-y-2.5">
          {/* Loading */}
          {loading && (
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-4/5" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/5" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
            </div>
          )}

          {/* No data */}
          {!loading && !hasContent && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Недостаточно данных для анализа
            </p>
          )}

          {/* Recommendations */}
          {!loading && data?.suggestedActions && data.suggestedActions.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Lightbulb className="w-3 h-3 text-amber-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Рекомендации
                </span>
              </div>
              <ul className="space-y-1">
                {data.suggestedActions.slice(0, 2).map((action, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed pl-4">
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Similar cases */}
          {!loading && data && data.similarCases.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Search className="w-3 h-3 text-blue-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Похожие решения
                </span>
              </div>
              <div className="space-y-1">
                {data.similarCases.slice(0, 3).map((sc) => (
                  <a
                    key={sc.requestId}
                    href={sc.legacyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 group text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                  >
                    <span className="text-gray-400 shrink-0">#{sc.requestId}</span>
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">
                      {sc.subject}
                    </span>
                    <span className="text-blue-500 font-medium shrink-0">
                      {Math.round(sc.similarity * 100)}%
                    </span>
                    <ExternalLink className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Experts */}
          {!loading && data && data.suggestedExperts.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <User className="w-3 h-3 text-green-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Эксперты
                </span>
              </div>
              <div className="space-y-0.5">
                {data.suggestedExperts.slice(0, 2).map((expert) => (
                  <div
                    key={expert.name}
                    className="flex items-center justify-between text-xs px-1.5 py-0.5"
                  >
                    <span className="text-gray-600 dark:text-gray-400 truncate">
                      {expert.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-gray-400 ml-1">
                        {expert.relevantCases} случа{expert.relevantCases === 1 ? 'й' : expert.relevantCases < 5 ? 'я' : 'ев'}
                      </span>
                      {onAssignExpert && (
                        <button
                          onClick={() => onAssignExpert(expert.name, expert.managerId)}
                          className="p-0.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                          title="Назначить исполнителем"
                        >
                          <UserPlus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer context */}
          {!loading && data?.relatedContext?.counterpartyName && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Building2 className="w-3 h-3 text-orange-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Клиент
                </span>
              </div>
              <div className="text-xs px-1.5 space-y-0.5">
                <p className="text-gray-700 dark:text-gray-300 font-medium">
                  {data.relatedContext.counterpartyName}
                </p>
                <p className="text-gray-400">
                  {data.relatedContext.customerTotalRequests
                    ? `${data.relatedContext.customerTotalRequests} обращений`
                    : ''}
                  {data.relatedContext.avgResolutionTimeHours
                    ? `${data.relatedContext.customerTotalRequests ? ' · ' : ''}ср. решение ${data.relatedContext.avgResolutionTimeHours}ч`
                    : ''}
                </p>
                {data.relatedContext.topCategories && data.relatedContext.topCategories.length > 0 && (
                  <p className="text-gray-400 truncate">
                    Темы: {data.relatedContext.topCategories.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Show details button */}
          {!loading && hasContent && onShowDetails && (
            <button
              onClick={onShowDetails}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium transition-colors"
            >
              Подробнее
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
