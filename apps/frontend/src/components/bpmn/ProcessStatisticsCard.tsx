'use client';

import { useMemo } from 'react';
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import type { ProcessDefinitionStatistics } from '@/types';

interface ProcessStatisticsCardProps {
  statistics: ProcessDefinitionStatistics | null;
  isLoading?: boolean;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}д ${hours % 24}ч`;
  if (hours > 0) return `${hours}ч ${minutes % 60}м`;
  if (minutes > 0) return `${minutes}м`;
  return `${seconds}с`;
}

export function ProcessStatisticsCard({
  statistics,
  isLoading = false,
}: ProcessStatisticsCardProps) {
  const statusData = useMemo(() => {
    if (!statistics) return [];

    return [
      {
        label: 'Активные',
        value: statistics.active,
        icon: Play,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-100 dark:bg-blue-900/30',
      },
      {
        label: 'Завершены',
        value: statistics.completed,
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bg: 'bg-green-100 dark:bg-green-900/30',
      },
      {
        label: 'Прерваны',
        value: statistics.terminated,
        icon: XCircle,
        color: 'text-gray-600 dark:text-gray-400',
        bg: 'bg-gray-100 dark:bg-gray-800',
      },
      {
        label: 'Ошибки',
        value: statistics.incident,
        icon: AlertTriangle,
        color: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-100 dark:bg-red-900/30',
      },
    ];
  }, [statistics]);

  // Calculate percentages for the bar chart
  const barData = useMemo(() => {
    if (!statistics || statistics.total === 0) return [];

    return statusData.map((s) => ({
      ...s,
      percentage: (s.value / statistics.total) * 100,
    }));
  }, [statistics, statusData]);

  if (isLoading) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-center text-gray-500">
        Нет данных
      </div>
    );
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Header with total */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Статистика
          </h3>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {statistics.total}
          </span>
          <span className="text-sm text-gray-500 ml-1">всего</span>
        </div>
      </div>

      {/* Progress bar */}
      {statistics.total > 0 && (
        <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex mb-4">
          {barData.map(
            (item, idx) =>
              item.percentage > 0 && (
                <div
                  key={idx}
                  className={item.bg}
                  style={{ width: `${item.percentage}%` }}
                  title={`${item.label}: ${item.value} (${item.percentage.toFixed(1)}%)`}
                />
              ),
          )}
        </div>
      )}

      {/* Status breakdown */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {statusData.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900"
            >
              <div className={`p-1.5 rounded ${item.bg}`}>
                <Icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {item.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Average duration */}
      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
        <div className="p-1.5 rounded bg-purple-100 dark:bg-purple-900/30">
          <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {formatDuration(statistics.avgDurationMs)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Среднее время выполнения
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProcessStatisticsCard;
