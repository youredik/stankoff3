'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox,
  Filter,
  RefreshCw,
  Search,
  ChevronDown,
  Clock,
  CheckCircle2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import type { UserTask, UserTaskStatus, UserTaskFilter } from '@/types';
import { tasksApi } from '@/lib/api/tasks';
import { TaskCard } from './TaskCard';

interface TaskInboxProps {
  workspaceId?: string;
  onTaskSelect?: (task: UserTask) => void;
  showFilters?: boolean;
}

type TabType = 'my' | 'available' | 'all';

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'my', label: 'Мои задачи', icon: Inbox },
  { id: 'available', label: 'Доступные', icon: Users },
  { id: 'all', label: 'Все', icon: CheckCircle2 },
];

const statusFilters: { value: UserTaskStatus | ''; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'created', label: 'Ожидают' },
  { value: 'claimed', label: 'В работе' },
  { value: 'completed', label: 'Завершенные' },
  { value: 'delegated', label: 'Делегированные' },
];

export function TaskInbox({
  workspaceId,
  onTaskSelect,
  showFilters = true,
}: TaskInboxProps) {
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('my');
  const [statusFilter, setStatusFilter] = useState<UserTaskStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let data: UserTask[];

      if (activeTab === 'my') {
        // Inbox - задачи назначенные текущему пользователю
        data = await tasksApi.getInbox(workspaceId);
      } else {
        // Все или доступные задачи
        const filters: UserTaskFilter = { workspaceId };
        if (statusFilter) {
          filters.status = statusFilter;
        }
        data = await tasksApi.getTasks(filters);
      }

      setTasks(data);
    } catch (err) {
      setError('Не удалось загрузить задачи');
      console.error('Failed to fetch tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, workspaceId, statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTasks();
    setIsRefreshing(false);
  };

  const handleClaim = async (task: UserTask) => {
    try {
      const updated = await tasksApi.claim(task.id);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated : t))
      );
    } catch (err) {
      console.error('Failed to claim task:', err);
    }
  };

  // Filter tasks by search query
  const filteredTasks = tasks.filter((task) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.elementName?.toLowerCase().includes(query) ||
      task.elementId.toLowerCase().includes(query) ||
      task.entity?.title?.toLowerCase().includes(query) ||
      task.entity?.customId?.toLowerCase().includes(query)
    );
  });

  // Group tasks by status for display
  const overdueCount = filteredTasks.filter(
    (t) =>
      t.dueDate &&
      new Date(t.dueDate) < new Date() &&
      t.status !== 'completed' &&
      t.status !== 'cancelled'
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Входящие задачи
          </h2>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded">
              <AlertTriangle className="w-3 h-3" />
              {overdueCount} просрочено
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск задач..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as UserTaskStatus | '')}
              className="appearance-none pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              {statusFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="text-teal-600 hover:text-teal-700 font-medium"
            >
              Попробовать снова
            </button>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery
                ? 'Задачи не найдены'
                : activeTab === 'my'
                  ? 'У вас нет активных задач'
                  : 'Нет доступных задач'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={onTaskSelect}
                onClaim={task.status === 'created' ? handleClaim : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with count */}
      {filteredTasks.length > 0 && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-700">
          Показано {filteredTasks.length} из {tasks.length} задач
        </div>
      )}
    </div>
  );
}

export default TaskInbox;
