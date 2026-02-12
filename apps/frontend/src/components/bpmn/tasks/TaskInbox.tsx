'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Loader2,
  ArrowUpDown,
} from 'lucide-react';
import type { UserTask, UserTaskStatus, UserTaskFilter } from '@/types';
import { tasksApi } from '@/lib/api/tasks';
import { TaskCard } from './TaskCard';

interface TaskInboxProps {
  workspaceId?: string;
  onTaskSelect?: (task: UserTask) => void;
  showFilters?: boolean;
  initialTab?: string;
}

type TabType = 'my' | 'available' | 'all';
type SortOption = 'priority' | 'createdAt' | 'dueDate';

const TASKS_PER_PAGE = 20;

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

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'priority', label: 'По приоритету' },
  { value: 'dueDate', label: 'По дедлайну' },
  { value: 'createdAt', label: 'По дате создания' },
];

const VALID_TABS: TabType[] = ['my', 'available', 'all'];

export function TaskInbox({
  workspaceId,
  onTaskSelect,
  showFilters = true,
  initialTab,
}: TaskInboxProps) {
  const resolvedInitialTab = useMemo(() =>
    initialTab && VALID_TABS.includes(initialTab as TabType) ? initialTab as TabType : 'my',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTabState] = useState<TabType>(resolvedInitialTab);

  const setActiveTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === 'my') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);
  const [statusFilter, setStatusFilter] = useState<UserTaskStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchTasks = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (!append) {
        setIsLoading(true);
      }
      setError(null);

      if (activeTab === 'my') {
        const result = await tasksApi.getInbox({
          workspaceId,
          page: pageNum,
          perPage: TASKS_PER_PAGE,
          sortBy,
        });
        if (append) {
          setTasks((prev) => [...prev, ...result.items]);
        } else {
          setTasks(result.items);
        }
        setTotal(result.total);
        setPage(result.page);
        setHasMore(result.page < result.totalPages);
      } else {
        const filters: UserTaskFilter = {
          workspaceId,
          page: pageNum,
          perPage: TASKS_PER_PAGE,
          sortBy,
        };
        if (statusFilter) {
          filters.status = statusFilter;
        }
        const result = await tasksApi.getTasks(filters);
        if (append) {
          setTasks((prev) => [...prev, ...result.items]);
        } else {
          setTasks(result.items);
        }
        setTotal(result.total);
        setPage(result.page);
        setHasMore(result.page < result.totalPages);
      }
    } catch (err) {
      setError('Не удалось загрузить задачи');
      console.error('Failed to fetch tasks:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeTab, workspaceId, statusFilter, sortBy]);

  // Reset and fetch on filter/tab change
  useEffect(() => {
    setTasks([]);
    setPage(1);
    fetchTasks(1, false);
  }, [fetchTasks]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    await fetchTasks(page + 1, true);
  }, [fetchTasks, page, hasMore, isLoadingMore]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      handleLoadMore();
    }
  }, [handleLoadMore, isLoadingMore, hasMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTasks([]);
    setPage(1);
    await fetchTasks(1, false);
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

  const handleSelectToggle = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // Filter tasks by search query (client-side, on loaded data)
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

  const selectableTasks = filteredTasks.filter((t) => t.status === 'created');

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === selectableTasks.length && selectableTasks.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableTasks.map((t) => t.id)));
    }
  }, [selectableTasks, selectedIds.size]);

  const handleBatchClaim = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchLoading(true);
    try {
      const result = await tasksApi.batchClaim(Array.from(selectedIds));
      if (result.succeeded.length > 0) {
        setSelectedIds(new Set());
        await fetchTasks(1, false);
      }
      if (result.failed.length > 0) {
        console.warn('Some tasks failed to claim:', result.failed);
      }
    } catch (err) {
      console.error('Batch claim failed:', err);
    } finally {
      setIsBatchLoading(false);
    }
  };

  const handleBatchDelegate = async (targetUserId: string) => {
    if (selectedIds.size === 0) return;
    setIsBatchLoading(true);
    try {
      const result = await tasksApi.batchDelegate(Array.from(selectedIds), targetUserId);
      if (result.succeeded.length > 0) {
        setSelectedIds(new Set());
        await fetchTasks(1, false);
      }
      if (result.failed.length > 0) {
        console.warn('Some tasks failed to delegate:', result.failed);
      }
    } catch (err) {
      console.error('Batch delegate failed:', err);
    } finally {
      setIsBatchLoading(false);
    }
  };

  // Count overdue in loaded tasks
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
            Входящие задания
          </h2>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded">
              <AlertTriangle className="w-3 h-3" />
              {overdueCount} просрочено
            </span>
          )}
          {total > 0 && (
            <span className="text-xs text-gray-500">
              ({total})
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

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Batch toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 border-b border-teal-200 dark:border-teal-800">
          <button
            onClick={handleSelectAll}
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
          >
            {selectedIds.size === selectableTasks.length ? 'Снять всё' : 'Выбрать все'}
          </button>
          <span className="text-sm text-teal-700 dark:text-teal-300 font-medium">
            Выбрано: {selectedIds.size}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleBatchClaim}
              disabled={isBatchLoading}
              className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isBatchLoading ? 'Обработка...' : 'Взять выбранные'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
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
                selectable={task.status === 'created'}
                selected={selectedIds.has(task.id)}
                onSelectToggle={handleSelectToggle}
              />
            ))}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                <span className="ml-2 text-sm text-gray-500">Загрузка...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with count */}
      {filteredTasks.length > 0 && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-700">
          Показано {filteredTasks.length} из {total} задач
        </div>
      )}
    </div>
  );
}

export default TaskInbox;
