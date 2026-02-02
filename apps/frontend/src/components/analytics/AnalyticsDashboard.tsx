'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  FolderKanban,
  FileText,
  TrendingUp,
  AlertCircle,
  UserX,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  analyticsApi,
  GlobalAnalytics,
  WorkspaceAnalytics,
} from '@/lib/api/analytics';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

// Priority labels and colors
const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'Высокий', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40' },
  medium: { label: 'Средний', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/40' },
  low: { label: 'Низкий', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40' },
};

// Default status colors
const STATUS_COLORS = [
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#EF4444', // red
  '#6366F1', // indigo
];

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color = 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400', subtitle }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  title: string;
}

function SimpleBarChart({ data, title }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="w-24 text-sm text-gray-600 dark:text-gray-400 truncate" title={item.label}>
              {item.label}
            </div>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color || STATUS_COLORS[index % STATUS_COLORS.length],
                }}
              />
            </div>
            <div className="w-10 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">
              {item.value}
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Нет данных</p>
        )}
      </div>
    </div>
  );
}

interface TimelineChartProps {
  data: { date: string; count: number }[];
  title: string;
}

function TimelineChart({ data, title }: TimelineChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{title}</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Нет данных за последние 30 дней</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 120;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{title}</h3>
      <div className="flex items-end gap-1" style={{ height: chartHeight }}>
        {data.map((item, index) => {
          const height = (item.count / maxValue) * chartHeight;
          const date = new Date(item.date);
          const day = date.getDate();

          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center group relative"
            >
              <div
                className="w-full bg-primary-500 rounded-t hover:bg-primary-600 transition-colors cursor-pointer"
                style={{ height: Math.max(height, 2) }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {item.count} заявок
                  <br />
                  {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              {/* Show day label every 5 days */}
              {(index === 0 || index === data.length - 1 || day % 5 === 0) && (
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">{day}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const { currentWorkspace, workspaces } = useWorkspaceStore();
  const [loading, setLoading] = useState(true);
  const [globalData, setGlobalData] = useState<GlobalAnalytics | null>(null);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceAnalytics | null>(null);
  const [viewMode, setViewMode] = useState<'global' | 'workspace'>('global');

  useEffect(() => {
    loadAnalytics();
  }, [currentWorkspace?.id, viewMode]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      if (viewMode === 'global') {
        const data = await analyticsApi.getGlobal();
        setGlobalData(data);
      } else if (currentWorkspace) {
        const data = await analyticsApi.getWorkspace(currentWorkspace.id);
        setWorkspaceData(data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Аналитика</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('global')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'global'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Все рабочие места
          </button>
          {currentWorkspace && (
            <button
              onClick={() => setViewMode('workspace')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                viewMode === 'workspace'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {currentWorkspace.icon} {currentWorkspace.name}
            </button>
          )}
        </div>
      </div>

      {viewMode === 'global' && globalData && (
        <GlobalDashboard data={globalData} />
      )}

      {viewMode === 'workspace' && workspaceData && (
        <WorkspaceDashboard data={workspaceData} />
      )}
    </div>
  );
}

function GlobalDashboard({ data }: { data: GlobalAnalytics }) {
  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Рабочих мест"
          value={data.totalWorkspaces}
          icon={<FolderKanban className="w-5 h-5" />}
          color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title="Всего заявок"
          value={data.totalEntities}
          icon={<FileText className="w-5 h-5" />}
          color="bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
        />
        <StatCard
          title="Активных пользователей"
          value={data.totalUsers}
          icon={<Users className="w-5 h-5" />}
          color="bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="Заявки по рабочим местам"
          data={data.entitiesByWorkspace.map((ws) => ({
            label: `${ws.icon} ${ws.name}`,
            value: ws.count,
          }))}
        />
        <SimpleBarChart
          title="По статусам"
          data={data.statusBreakdown.map((s) => ({
            label: s.statusLabel,
            value: s.count,
          }))}
        />
      </div>

      {/* Priority & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="По приоритету"
          data={data.priorityBreakdown.map((p) => ({
            label: PRIORITY_CONFIG[p.priority]?.label || p.priority,
            value: p.count,
            color: p.priority === 'high' ? '#EF4444' : p.priority === 'medium' ? '#F59E0B' : '#10B981',
          }))}
        />
        <TimelineChart
          title="Создано заявок (последние 30 дней)"
          data={data.recentActivity}
        />
      </div>
    </>
  );
}

function WorkspaceDashboard({ data }: { data: WorkspaceAnalytics }) {
  return (
    <>
      {/* Workspace Header */}
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        <span className="text-2xl">{data.workspaceIcon}</span>
        <span className="text-lg font-medium">{data.workspaceName}</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Всего заявок"
          value={data.totalEntities}
          icon={<FileText className="w-5 h-5" />}
          color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title="Без исполнителя"
          value={data.unassignedCount}
          icon={<UserX className="w-5 h-5" />}
          color="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400"
          subtitle="Требуют назначения"
        />
        <StatCard
          title="Просрочено"
          value={data.overdueCount}
          icon={<AlertCircle className="w-5 h-5" />}
          color="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
          subtitle="Новые > 7 дней"
        />
        <StatCard
          title="Исполнителей"
          value={data.assigneeBreakdown.filter((a) => a.assigneeId).length}
          icon={<Users className="w-5 h-5" />}
          color="bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="По статусам"
          data={data.statusBreakdown.map((s) => ({
            label: s.statusLabel,
            value: s.count,
            color: s.color,
          }))}
        />
        <SimpleBarChart
          title="По приоритету"
          data={data.priorityBreakdown.map((p) => ({
            label: PRIORITY_CONFIG[p.priority]?.label || p.priority,
            value: p.count,
            color: p.priority === 'high' ? '#EF4444' : p.priority === 'medium' ? '#F59E0B' : '#10B981',
          }))}
        />
      </div>

      {/* Assignee & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="По исполнителям"
          data={data.assigneeBreakdown.map((a) => ({
            label: a.firstName
              ? `${a.firstName} ${a.lastName || ''}`.trim()
              : 'Не назначен',
            value: a.count,
          }))}
        />
        <TimelineChart
          title="Создано заявок (последние 30 дней)"
          data={data.createdOverTime}
        />
      </div>
    </>
  );
}
