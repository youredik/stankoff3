'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Loader2,
  Calendar,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  getWorkspaceStats,
  getProcessStats,
  getTimeAnalysis,
  type WorkspaceProcessStats,
  type ProcessMiningStats,
  type TimeAnalysis,
} from '@/lib/api/processMining';
import { bpmnApi } from '@/lib/api/bpmn';
import type { ProcessDefinition } from '@/types';

interface ProcessMiningDashboardProps {
  workspaceId: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активные',
  completed: 'Завершённые',
  terminated: 'Прерванные',
  incident: 'С инцидентами',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500',
  completed: 'bg-green-500',
  terminated: 'bg-gray-500',
  incident: 'bg-red-500',
};

type DateRange = '7d' | '30d' | '90d' | 'all';

export function ProcessMiningDashboard({ workspaceId }: ProcessMiningDashboardProps) {
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceProcessStats | null>(null);
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [processStats, setProcessStats] = useState<ProcessMiningStats | null>(null);
  const [timeAnalysis, setTimeAnalysis] = useState<TimeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const getDateRange = (range: DateRange): { start?: Date; end?: Date } => {
    const end = new Date();
    switch (range) {
      case '7d':
        return { start: subDays(end, 7), end };
      case '30d':
        return { start: subDays(end, 30), end };
      case '90d':
        return { start: subDays(end, 90), end };
      default:
        return {};
    }
  };

  // Load workspace stats and definitions
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange(dateRange);
        const [statsData, defsData] = await Promise.all([
          getWorkspaceStats(workspaceId, start, end),
          bpmnApi.getDefinitions(workspaceId),
        ]);
        setWorkspaceStats(statsData);
        setDefinitions(defsData);
      } catch (err) {
        console.error('Failed to load process mining data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [workspaceId, dateRange]);

  // Load detailed stats when a definition is selected
  useEffect(() => {
    if (!selectedDefinitionId) {
      setProcessStats(null);
      setTimeAnalysis(null);
      return;
    }

    const loadDetails = async () => {
      setLoadingDetails(true);
      try {
        const { start, end } = getDateRange(dateRange);
        const [stats, time] = await Promise.all([
          getProcessStats(selectedDefinitionId, start, end),
          getTimeAnalysis(selectedDefinitionId, start, end),
        ]);
        setProcessStats(stats);
        setTimeAnalysis(time);
      } catch (err) {
        console.error('Failed to load process details:', err);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadDetails();
  }, [selectedDefinitionId, dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!workspaceStats) {
    return (
      <div className="text-center py-16 text-gray-500">
        Не удалось загрузить данные Process Mining
      </div>
    );
  }

  const maxVolume = Math.max(...workspaceStats.topProcessesByVolume.map((p) => p.count), 1);
  const maxDuration = Math.max(...workspaceStats.topProcessesByDuration.map((p) => p.avgMinutes), 1);
  const totalStatusCount = workspaceStats.statusDistribution.reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Header with date range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-500" />
          Process Mining Analytics
        </h2>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="7d">Последние 7 дней</option>
            <option value="30d">Последние 30 дней</option>
            <option value="90d">Последние 90 дней</option>
            <option value="all">Всё время</option>
          </select>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="w-5 h-5 text-blue-500" />}
          label="Всего процессов"
          value={workspaceStats.totalDefinitions}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-teal-500" />}
          label="Запущено экземпляров"
          value={workspaceStats.totalInstances}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
          label="Завершённость"
          value={`${workspaceStats.avgCompletionRate.toFixed(1)}%`}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-yellow-500" />}
          label="Среднее время"
          value={formatDuration(workspaceStats.avgDurationMinutes)}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Распределение по статусам
          </h3>
          <div className="space-y-3">
            {workspaceStats.statusDistribution.map((item) => {
              const percent = totalStatusCount > 0 ? (item.count / totalStatusCount) * 100 : 0;
              return (
                <div key={item.status}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {item.count} ({percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${STATUS_COLORS[item.status] || 'bg-gray-400'} transition-all duration-300`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {workspaceStats.statusDistribution.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Нет данных</p>
            )}
          </div>
        </div>

        {/* Top Processes by Volume */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Топ процессов по объёму
          </h3>
          <div className="space-y-3">
            {workspaceStats.topProcessesByVolume.map((process, index) => {
              const percent = (process.count / maxVolume) * 100;
              return (
                <div key={process.name + index}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[60%]">
                      {process.name}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {process.count}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {workspaceStats.topProcessesByVolume.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Нет данных</p>
            )}
          </div>
        </div>

        {/* Top Processes by Duration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Самые долгие процессы
          </h3>
          <div className="space-y-3">
            {workspaceStats.topProcessesByDuration.map((process, index) => {
              const percent = (process.avgMinutes / maxDuration) * 100;
              return (
                <div key={process.name + index}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[60%]">
                      {process.name}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatDuration(process.avgMinutes)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {workspaceStats.topProcessesByDuration.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">Нет данных</p>
            )}
          </div>
        </div>

        {/* Process Selector for Detailed Analysis */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Детальный анализ процесса
          </h3>
          <select
            value={selectedDefinitionId || ''}
            onChange={(e) => setSelectedDefinitionId(e.target.value || null)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm"
          >
            <option value="">Выберите процесс...</option>
            {definitions.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name}
              </option>
            ))}
          </select>
          {loadingDetails && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
            </div>
          )}
          {!loadingDetails && processStats && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Всего:</span>{' '}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {processStats.totalInstances}
                  </span>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Активных:</span>{' '}
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {processStats.activeInstances}
                  </span>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Завершено:</span>{' '}
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {processStats.completedInstances}
                  </span>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  <span className="text-gray-500 dark:text-gray-400">С ошибками:</span>{' '}
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {processStats.incidentInstances}
                  </span>
                </div>
              </div>
              {processStats.avgDurationMinutes && (
                <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                  <div className="text-xs text-teal-600 dark:text-teal-400 mb-1">
                    Время выполнения
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>
                      Мин: <strong>{formatDuration(processStats.minDurationMinutes)}</strong>
                    </span>
                    <span>
                      Медиана: <strong>{formatDuration(processStats.medianDurationMinutes)}</strong>
                    </span>
                    <span>
                      Макс: <strong>{formatDuration(processStats.maxDurationMinutes)}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Time Analysis Section (shown when a definition is selected) */}
      {timeAnalysis && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Временной анализ: {processStats?.definitionName}
          </h3>

          <div className="grid grid-cols-2 gap-6">
            {/* Day of Week Stats */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">
                Активность по дням недели
              </h4>
              <div className="space-y-2">
                {timeAnalysis.dayOfWeekStats.map((day) => {
                  const maxInstances = Math.max(...timeAnalysis.dayOfWeekStats.map((d) => d.avgInstances), 1);
                  const percent = (day.avgInstances / maxInstances) * 100;
                  return (
                    <div key={day.day} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-20 truncate">
                        {day.day}
                      </span>
                      <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-8 text-right">
                        {day.avgInstances}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hourly Distribution */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">
                Распределение по часам
              </h4>
              <div className="flex items-end gap-1 h-32">
                {timeAnalysis.hourlyStats.map((hour) => {
                  const maxHourly = Math.max(...timeAnalysis.hourlyStats.map((h) => h.avgInstances), 1);
                  const percent = maxHourly > 0 ? (hour.avgInstances / maxHourly) * 100 : 0;
                  return (
                    <div
                      key={hour.hour}
                      className="flex-1 flex flex-col items-center"
                      title={`${hour.hour}:00 - ${hour.avgInstances} экземпляров`}
                    >
                      <div
                        className="w-full bg-teal-500 rounded-t transition-all duration-300"
                        style={{ height: `${Math.max(percent, 2)}%` }}
                      />
                      {hour.hour % 6 === 0 && (
                        <span className="text-[10px] text-gray-400 mt-1">{hour.hour}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Trend Line */}
          {timeAnalysis.trendLine.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">
                Тренд за период
              </h4>
              <div className="flex items-end gap-0.5 h-24">
                {timeAnalysis.trendLine.slice(-30).map((point) => {
                  const maxTrend = Math.max(...timeAnalysis.trendLine.map((p) => p.instances), 1);
                  const percent = (point.instances / maxTrend) * 100;
                  return (
                    <div
                      key={point.date}
                      className="flex-1 bg-gradient-to-t from-teal-500 to-teal-400 rounded-t transition-all duration-300 hover:from-teal-600 hover:to-teal-500"
                      style={{ height: `${Math.max(percent, 2)}%` }}
                      title={`${format(new Date(point.date), 'd MMM', { locale: ru })}: ${point.instances} экз., ${formatDuration(point.avgDuration)}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                {timeAnalysis.trendLine.length > 0 && (
                  <>
                    <span>{format(new Date(timeAnalysis.trendLine[0].date), 'd MMM', { locale: ru })}</span>
                    <span>{format(new Date(timeAnalysis.trendLine[timeAnalysis.trendLine.length - 1].date), 'd MMM', { locale: ru })}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Duration Distribution for selected process */}
      {processStats && processStats.durationDistribution.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Распределение времени выполнения: {processStats.definitionName}
          </h3>
          <div className="flex items-end gap-2 h-32">
            {processStats.durationDistribution.map((bucket) => {
              const maxBucket = Math.max(...processStats.durationDistribution.map((b) => b.count), 1);
              const percent = (bucket.count / maxBucket) * 100;
              return (
                <div key={bucket.bucket} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-gradient-to-t from-yellow-500 to-yellow-400 rounded-t transition-all duration-300"
                    style={{ height: `${Math.max(percent, 5)}%` }}
                  />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 text-center">
                    {bucket.bucket}
                  </span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {bucket.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">{icon}</div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return '< 1 мин';
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  return hours > 0 ? `${days}д ${hours}ч` : `${days}д`;
}

export default ProcessMiningDashboard;
