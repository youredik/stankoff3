'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Briefcase, Loader2, AlertCircle } from 'lucide-react';
import { legacyApi, legacyUrls } from '@/lib/api/legacy';
import type { LegacyDeal } from '@/types/legacy';

interface LegacyDealLinkProps {
  /** ID сделки в Legacy CRM */
  dealId: number;
  /** Показывать детали сделки */
  showDetails?: boolean;
  /** CSS класс для контейнера */
  className?: string;
  /** Размер компонента */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Компонент отображения ссылки на сделку в Legacy CRM
 *
 * Использование:
 * ```tsx
 * <LegacyDealLink dealId={12345} showDetails />
 * ```
 */
export function LegacyDealLink({
  dealId,
  showDetails = false,
  className = '',
  size = 'md',
}: LegacyDealLinkProps) {
  const [deal, setDeal] = useState<LegacyDeal | null>(null);
  const [isLoading, setIsLoading] = useState(showDetails);
  const [error, setError] = useState(false);

  // Загружаем детали сделки если нужно
  useEffect(() => {
    if (showDetails && dealId) {
      setIsLoading(true);
      setError(false);

      legacyApi.getDeal(dealId)
        .then(setDeal)
        .catch(() => setError(true))
        .finally(() => setIsLoading(false));
    }
  }, [dealId, showDetails]);

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const url = legacyUrls.deal(dealId);

  // Простая ссылка без деталей
  if (!showDetails) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline ${sizeClasses[size]} ${className}`}
      >
        <Briefcase className={iconSizes[size]} />
        <span>Сделка #{dealId}</span>
        <ExternalLink className={`${iconSizes[size]} opacity-50`} />
      </a>
    );
  }

  // Загрузка
  if (isLoading) {
    return (
      <div className={`inline-flex items-center gap-2 text-gray-400 ${sizeClasses[size]} ${className}`}>
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
        <span>Загрузка сделки...</span>
      </div>
    );
  }

  // Ошибка загрузки
  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 text-red-500 hover:text-red-600 ${sizeClasses[size]} ${className}`}
      >
        <AlertCircle className={iconSizes[size]} />
        <span>Сделка #{dealId} (ошибка загрузки)</span>
        <ExternalLink className={`${iconSizes[size]} opacity-50`} />
      </a>
    );
  }

  // Сделка с деталями
  if (deal) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group inline-flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 transition-colors ${className}`}
      >
        <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg group-hover:bg-teal-200 dark:group-hover:bg-teal-900/50 transition-colors">
          <Briefcase className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {deal.name || `Сделка #${deal.id}`}
            </span>
            {deal.stageName && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: deal.stageColor ? `${deal.stageColor}20` : undefined,
                  color: deal.stageColor || undefined,
                }}
              >
                {deal.stageName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {deal.formattedSum}
            </span>
            {deal.counterpartyName && (
              <>
                <span>•</span>
                <span className="truncate">{deal.counterpartyName}</span>
              </>
            )}
            {deal.isClosed && (
              <>
                <span>•</span>
                <span className="text-green-600 dark:text-green-400">Закрыта</span>
              </>
            )}
          </div>
        </div>

        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-teal-500 transition-colors shrink-0" />
      </a>
    );
  }

  return null;
}

/**
 * Компонент для отображения нескольких сделок
 */
interface LegacyDealsListProps {
  /** IDs сделок */
  dealIds: number[];
  /** CSS класс для контейнера */
  className?: string;
}

export function LegacyDealsList({ dealIds, className = '' }: LegacyDealsListProps) {
  if (dealIds.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {dealIds.map((id) => (
        <LegacyDealLink key={id} dealId={id} showDetails />
      ))}
    </div>
  );
}

export default LegacyDealLink;
