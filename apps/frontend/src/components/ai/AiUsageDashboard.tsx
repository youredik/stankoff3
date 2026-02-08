'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Zap, Clock, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import type { AiUsageStats, AiUsageLog } from '@/types/ai';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  ollama: 'Ollama',
  groq: 'Groq',
  unknown: 'Неизвестный',
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-500',
  ollama: 'bg-blue-500',
  groq: 'bg-purple-500',
  unknown: 'bg-gray-500',
};

const OPERATION_LABELS: Record<string, string> = {
  classify: 'Классификация',
  generate: 'Генерация',
  embed: 'Эмбеддинги',
  search: 'Поиск',
  chat: 'Чат',
  summarize: 'Суммаризация',
};

interface AiUsageDashboardProps {
  /** Период в днях */
  defaultDays?: number;
}

/**
 * Дашборд статистики использования AI
 */
export function AiUsageDashboard({ defaultDays = 30 }: AiUsageDashboardProps) {
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(defaultDays);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsData, logsData] = await Promise.all([
        aiApi.getUsageStats({ days }),
        aiApi.getUsageLogs({ limit: 20 }),
      ]);
      setStats(statsData);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load AI usage stats:', err);
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mb-3" />
        <span>Загрузка статистики...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-500">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const maxTokensInDay = Math.max(...stats.byDay.map(d => d.totalTokens), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Статистика AI
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <option value={7}>7 дней</option>
            <option value={14}>14 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
          <button
            onClick={loadData}
            className="p-2 text-gray-500 hover:text-teal-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-gray-500 uppercase">Запросов</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.totalRequests.toLocaleString()}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500 uppercase">Токенов</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.totalTokens.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {stats.totalInputTokens.toLocaleString()} вх / {stats.totalOutputTokens.toLocaleString()} вых
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-gray-500 uppercase">Ср. время</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.avgLatencyMs}
            <span className="text-sm font-normal text-gray-500 ml-1">мс</span>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500 uppercase">Успешность</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.successRate}%
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* By Provider */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            По провайдерам
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.byProvider).map(([provider, data]) => (
              <div key={provider}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {PROVIDER_LABELS[provider] || provider}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {data.requests} запросов
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${PROVIDER_COLORS[provider] || 'bg-gray-500'} rounded-full`}
                      style={{ width: `${(data.requests / stats.totalRequests) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {Math.round((data.requests / stats.totalRequests) * 100)}%
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {data.inputTokens.toLocaleString()} + {data.outputTokens.toLocaleString()} токенов, ~{data.avgLatency}мс
                </p>
              </div>
            ))}
            {Object.keys(stats.byProvider).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Нет данных</p>
            )}
          </div>
        </div>

        {/* By Operation */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            По операциям
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.byOperation).map(([operation, data]) => (
              <div key={operation}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {OPERATION_LABELS[operation] || operation}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {data.requests} запросов
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${(data.requests / stats.totalRequests) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {Math.round((data.requests / stats.totalRequests) * 100)}%
                  </span>
                </div>
              </div>
            ))}
            {Object.keys(stats.byOperation).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Нет данных</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily Usage Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Использование по дням
        </h3>
        {stats.byDay.length > 0 ? (
          <div className="flex items-end gap-1 h-32">
            {stats.byDay.map((day) => (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center group"
                title={`${format(new Date(day.date), 'dd MMM', { locale: ru })}: ${day.requests} запросов, ${day.totalTokens.toLocaleString()} токенов`}
              >
                <div className="w-full flex flex-col justify-end h-24">
                  <div
                    className="w-full bg-teal-500 rounded-t transition-all group-hover:bg-teal-400"
                    style={{ height: `${(day.totalTokens / maxTokensInDay) * 100}%`, minHeight: day.totalTokens > 0 ? '4px' : '0' }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 mt-1 rotate-0">
                  {format(new Date(day.date), 'dd', { locale: ru })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">Нет данных за выбранный период</p>
        )}
      </div>

      {/* Recent Logs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Последние запросы
        </h3>
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Время</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Провайдер</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Операция</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Токены</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">Время</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 px-2 text-gray-600 dark:text-gray-400">
                      {format(new Date(log.createdAt), 'dd.MM HH:mm', { locale: ru })}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        PROVIDER_COLORS[log.provider]?.replace('bg-', 'bg-opacity-20 text-') || 'bg-gray-100 text-gray-600'
                      }`}>
                        {PROVIDER_LABELS[log.provider] || log.provider}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-gray-600 dark:text-gray-400">
                      {OPERATION_LABELS[log.operation] || log.operation}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">
                      {(log.inputTokens + log.outputTokens).toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">
                      {log.latencyMs}мс
                    </td>
                    <td className="py-2 px-2 text-center">
                      {log.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <span title={log.error}>
                          <AlertTriangle className="w-4 h-4 text-red-500 mx-auto" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">Нет записей</p>
        )}
      </div>
    </div>
  );
}

export default AiUsageDashboard;
