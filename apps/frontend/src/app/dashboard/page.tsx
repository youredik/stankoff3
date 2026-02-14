'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Inbox,
  TrendingUp,
  RefreshCw,
  ArrowRight,
  Zap,
  ShieldAlert,
  Timer,
  BarChart3,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { AppShell } from '@/components/layout/AppShell';
import { apiClient } from '@/lib/api/client';

interface WorkspaceSummary {
  workspaceId: string;
  workspaceName: string;
  taskStats: {
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
    avgCompletionTimeMs: number | null;
  } | null;
  sla: {
    total: number;
    pending: number;
    met: number;
    breached: number;
    atRisk: number;
  } | null;
  processStats: {
    totalDefinitions: number;
    totalInstances: number;
    avgCompletionRate: number;
    avgDurationMinutes: number;
    statusDistribution: { status: string; count: number }[];
  } | null;
}

interface DashboardSummaryResponse {
  inboxCount: number;
  summaries: WorkspaceSummary[];
}

interface DashboardData {
  summaries: WorkspaceSummary[];
  myInboxCount: number;
  loading: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData>({
    summaries: [],
    myInboxCount: 0,
    loading: true,
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await apiClient.get<DashboardSummaryResponse>(
        '/dashboard/summary',
      );
      setData({
        summaries: response.data.summaries,
        myInboxCount: response.data.inboxCount,
        loading: false,
      });
    } catch {
      setData({ summaries: [], myInboxCount: 0, loading: false });
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  // Агрегированные метрики
  const totals = data.summaries.reduce(
    (acc, s) => {
      if (s.taskStats) {
        acc.totalTasks += s.taskStats.total;
        acc.overdueTasks += s.taskStats.overdue;
        acc.createdTasks += s.taskStats.byStatus?.created || 0;
        acc.claimedTasks += s.taskStats.byStatus?.claimed || 0;
        acc.completedTasks += s.taskStats.byStatus?.completed || 0;
      }
      if (s.sla) {
        acc.slaPending += s.sla.pending;
        acc.slaMet += s.sla.met;
        acc.slaBreached += s.sla.breached;
        acc.slaAtRisk += s.sla.atRisk;
        acc.slaTotal += s.sla.total;
      }
      if (s.processStats) {
        acc.totalProcesses += s.processStats.totalDefinitions;
        acc.activeInstances += s.processStats.statusDistribution?.find(
          (d) => d.status === 'active',
        )?.count || 0;
        acc.completedInstances += s.processStats.statusDistribution?.find(
          (d) => d.status === 'completed',
        )?.count || 0;
        acc.incidentInstances += s.processStats.statusDistribution?.find(
          (d) => d.status === 'incident',
        )?.count || 0;
      }
      return acc;
    },
    {
      totalTasks: 0,
      overdueTasks: 0,
      createdTasks: 0,
      claimedTasks: 0,
      completedTasks: 0,
      slaPending: 0,
      slaMet: 0,
      slaBreached: 0,
      slaAtRisk: 0,
      slaTotal: 0,
      totalProcesses: 0,
      activeInstances: 0,
      completedInstances: 0,
      incidentInstances: 0,
    },
  );

  const slaComplianceRate =
    totals.slaTotal > 0
      ? Math.round(((totals.slaMet / totals.slaTotal) * 100))
      : null;

  if (data.loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
            <span className="text-gray-500 dark:text-gray-400">
              Загрузка дашборда...
            </span>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Дашборд
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {user
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
              : ''}{' '}
            — обзор всех рабочих мест
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Обновить дашборд"
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Inbox */}
        <button
          onClick={() => router.push('/tasks')}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors text-left group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
              <Inbox className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.myInboxCount}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Мои задания
          </div>
        </button>

        {/* Overdue Tasks */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div
              className={`p-2 rounded-lg ${
                totals.overdueTasks > 0
                  ? 'bg-red-50 dark:bg-red-900/30'
                  : 'bg-green-50 dark:bg-green-900/30'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  totals.overdueTasks > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`}
              />
            </div>
          </div>
          <div
            className={`text-2xl font-bold ${
              totals.overdueTasks > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {totals.overdueTasks}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Просроченные
          </div>
        </div>

        {/* Active Processes */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {totals.activeInstances}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Активных процессов
          </div>
        </div>

        {/* SLA Compliance */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div
              className={`p-2 rounded-lg ${
                slaComplianceRate !== null && slaComplianceRate < 80
                  ? 'bg-amber-50 dark:bg-amber-900/30'
                  : 'bg-green-50 dark:bg-green-900/30'
              }`}
            >
              <ShieldAlert
                className={`w-5 h-5 ${
                  slaComplianceRate !== null && slaComplianceRate < 80
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
                }`}
              />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {slaComplianceRate !== null ? `${slaComplianceRate}%` : '—'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            SLA выполнение
          </div>
        </div>
      </div>

      {/* Task & Process Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Summary */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-gray-400" />
            Задания
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Новые (ожидают)
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {totals.createdTasks}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                В работе
              </span>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {totals.claimedTasks}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Завершённые
              </span>
              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                {totals.completedTasks}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Всего
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {totals.totalTasks}
              </span>
            </div>
          </div>
        </div>

        {/* SLA Summary */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Timer className="w-5 h-5 text-gray-400" />
            SLA
          </h2>
          {totals.slaTotal > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Выполнены
                  </span>
                </div>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {totals.slaMet}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    В процессе
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {totals.slaPending}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Под угрозой
                  </span>
                </div>
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {totals.slaAtRisk}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Нарушены
                  </span>
                </div>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {totals.slaBreached}
                </span>
              </div>
              {/* SLA bar */}
              <div className="pt-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden flex">
                  {totals.slaMet > 0 && (
                    <div
                      className="bg-green-500 h-full"
                      style={{
                        width: `${(totals.slaMet / totals.slaTotal) * 100}%`,
                      }}
                    />
                  )}
                  {totals.slaPending > 0 && (
                    <div
                      className="bg-gray-400 h-full"
                      style={{
                        width: `${(totals.slaPending / totals.slaTotal) * 100}%`,
                      }}
                    />
                  )}
                  {totals.slaAtRisk > 0 && (
                    <div
                      className="bg-amber-500 h-full"
                      style={{
                        width: `${(totals.slaAtRisk / totals.slaTotal) * 100}%`,
                      }}
                    />
                  )}
                  {totals.slaBreached > 0 && (
                    <div
                      className="bg-red-500 h-full"
                      style={{
                        width: `${(totals.slaBreached / totals.slaTotal) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
              Нет активных SLA
            </div>
          )}
        </div>
      </div>

      {/* Per-workspace breakdown */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          По рабочим местам
        </h2>
        {data.summaries.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
            Нет доступных рабочих мест
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="pb-3 font-medium">Рабочее место</th>
                  <th className="pb-3 font-medium text-center">Задания</th>
                  <th className="pb-3 font-medium text-center">
                    Просроч.
                  </th>
                  <th className="pb-3 font-medium text-center">
                    Процессы
                  </th>
                  <th className="pb-3 font-medium text-center">SLA %</th>
                  <th className="pb-3 font-medium text-center">
                    Инциденты
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {data.summaries.map((s) => {
                  const wsSlaPct =
                    s.sla && s.sla.total > 0
                      ? Math.round((s.sla.met / s.sla.total) * 100)
                      : null;
                  const incidents =
                    s.processStats?.statusDistribution?.find(
                      (d) => d.status === 'incident',
                    )?.count || 0;
                  const activeProcs =
                    s.processStats?.statusDistribution?.find(
                      (d) => d.status === 'active',
                    )?.count || 0;
                  return (
                    <tr key={s.workspaceId} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="py-3">
                        <button
                          onClick={() =>
                            router.push(`/workspace/${s.workspaceId}`)
                          }
                          className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                          {s.workspaceName}
                        </button>
                      </td>
                      <td className="py-3 text-center text-gray-700 dark:text-gray-300">
                        {s.taskStats?.total || 0}
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={
                            (s.taskStats?.overdue || 0) > 0
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-gray-400'
                          }
                        >
                          {s.taskStats?.overdue || 0}
                        </span>
                      </td>
                      <td className="py-3 text-center text-gray-700 dark:text-gray-300">
                        {activeProcs}
                      </td>
                      <td className="py-3 text-center">
                        {wsSlaPct !== null ? (
                          <span
                            className={
                              wsSlaPct >= 90
                                ? 'text-green-600 dark:text-green-400 font-semibold'
                                : wsSlaPct >= 70
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : 'text-red-600 dark:text-red-400 font-semibold'
                            }
                          >
                            {wsSlaPct}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={
                            incidents > 0
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-gray-400'
                          }
                        >
                          {incidents}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => router.push('/tasks')}
          className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 transition-colors group"
        >
          <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
            <Inbox className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Входящие задания
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Перейти к задачам
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
        </button>

        <button
          onClick={() => router.push('/chat')}
          className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 transition-colors group"
        >
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Чат
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Обсуждения
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
        </button>

        <button
          onClick={() => router.push('/knowledge-base')}
          className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 transition-colors group"
        >
          <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              База знаний
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Документация
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
        </button>
      </div>
    </div>
    </AppShell>
  );
}
