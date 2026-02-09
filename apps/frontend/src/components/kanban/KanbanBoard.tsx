'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Plus, Filter, Settings, X, Eye } from 'lucide-react';
import { SkeletonColumn } from '@/components/ui/Skeleton';
import { useRouter } from 'next/navigation';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { EntityDetailPanel } from './EntityDetailPanel';
import { CreateEntityModal } from './CreateEntityModal';
import {
  FilterPanel,
  createEmptyFilters,
  isFilterActive,
  type FilterState,
} from './FilterPanel';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { Entity, FieldOption } from '@/types';
import type { EntityFilters } from '@/lib/api/entities';

interface KanbanBoardProps {
  workspaceId: string;
}

// Default columns for backwards compatibility
const DEFAULT_COLUMNS: FieldOption[] = [
  { id: 'new', label: 'Новые', color: '#3B82F6' },
  { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
  { id: 'testing', label: 'Тестирование', color: '#8B5CF6' },
  { id: 'done', label: 'Готово', color: '#10B981' },
];

function filtersToApi(filters: FilterState): EntityFilters {
  return {
    search: filters.search || undefined,
    assigneeId: filters.assigneeIds.length > 0 ? filters.assigneeIds : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  };
}

export function KanbanBoard({ workspaceId }: KanbanBoardProps) {
  const router = useRouter();
  const [activeCard, setActiveCard] = useState<Entity | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(createEmptyFilters);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    kanbanColumns,
    kanbanLoading,
    totalAll,
    fetchKanban,
    loadMoreColumn,
    setKanbanFilters,
    fetchUsers,
    updateStatus,
    getAllEntities,
  } = useEntityStore();
  const { currentWorkspace, fetchWorkspace, canEdit, currentRole } = useWorkspaceStore();
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'admin' || currentRole === 'admin';
  const canEditEntities = canEdit();

  useEffect(() => {
    fetchKanban(workspaceId);
    fetchUsers();
    fetchWorkspace(workspaceId);
  }, [workspaceId, fetchKanban, fetchUsers, fetchWorkspace]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const columns = useMemo(() => {
    if (!currentWorkspace?.sections) return DEFAULT_COLUMNS;
    for (const section of currentWorkspace.sections) {
      const statusField = section.fields.find((f) => f.type === 'status');
      if (statusField?.options && statusField.options.length > 0) {
        return statusField.options;
      }
    }
    return DEFAULT_COLUMNS;
  }, [currentWorkspace]);

  // Count loaded entities across all columns
  const loadedCount = useMemo(() => {
    return Object.values(kanbanColumns).reduce((sum, col) => sum + col.items.length, 0);
  }, [kanbanColumns]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.assigneeIds.length > 0) count++;
    if (filters.priorities.length > 0) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    for (const value of Object.values(filters.customFilters)) {
      if (isFilterActive(value)) count++;
    }
    return count;
  }, [filters]);

  // Handle filter changes with debounce for search
  const prevSearchRef = useRef(filters.search);
  const handleFiltersChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      const apiFilters = filtersToApi(newFilters);
      const searchChanged = newFilters.search !== prevSearchRef.current;
      prevSearchRef.current = newFilters.search;

      if (searchChanged && newFilters.search) {
        searchTimerRef.current = setTimeout(() => {
          setKanbanFilters(apiFilters);
        }, 300);
      } else {
        setKanbanFilters(apiFilters);
      }
    },
    [setKanbanFilters],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const allEntities = getAllEntities();
    const card = allEntities.find((e) => e.id === event.active.id);
    if (card) setActiveCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!canEditEntities) return;
    if (!over || active.id === over.id) return;

    const overId = over.id as string;
    const isColumn = columns.some((col) => col.id === overId);

    if (isColumn) {
      updateStatus(active.id as string, overId);
    } else {
      const allEntities = getAllEntities();
      const targetCard = allEntities.find((e) => e.id === overId);
      if (targetCard) {
        updateStatus(active.id as string, targetCard.status);
      }
    }
  };

  const clearFilters = () => {
    const empty = createEmptyFilters();
    setFilters(empty);
    prevSearchRef.current = '';
    setKanbanFilters({});
  };

  if (kanbanLoading && Object.keys(kanbanColumns).length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        <SkeletonColumn />
        <SkeletonColumn />
        <SkeletonColumn />
        <SkeletonColumn />
      </div>
    );
  }

  return (
    <div>
      <div>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {currentWorkspace?.name || 'Загрузка...'}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {activeFilterCount > 0
                    ? `${totalAll} из всех заявок`
                    : `${totalAll} заявок`}
                  {loadedCount < totalAll && ` (загружено ${loadedCount})`}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFilters(true)}
                aria-label="Открыть фильтры"
                aria-expanded={showFilters}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors cursor-pointer backdrop-blur-sm ${
                  activeFilterCount > 0
                    ? 'border-primary-300 dark:border-primary-700 bg-primary-50/80 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Filter className="w-5 h-5" />
                <span>Фильтры</span>
                {activeFilterCount > 0 && (
                  <span className="bg-primary-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  aria-label="Сбросить все фильтры"
                  className="flex items-center gap-1 px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-800/80 rounded-lg transition-colors cursor-pointer backdrop-blur-sm"
                >
                  <X className="w-4 h-4" />
                  <span>Сбросить</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => router.push(`/workspace/${workspaceId}/settings`)}
                  aria-label="Настройки рабочего места"
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer backdrop-blur-sm"
                >
                  <Settings className="w-5 h-5" />
                  <span>Настройки</span>
                </button>
              )}
              {canEditEntities && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  aria-label="Создать новую заявку"
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  <span>Новая заявка</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {!canEditEntities && currentRole && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-gray-100/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 backdrop-blur-sm">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Режим просмотра — вы можете просматривать заявки, но не можете их редактировать</span>
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex overflow-x-auto pb-4">
            {columns.map((column) => {
              const colData = kanbanColumns[column.id] || {
                items: [],
                total: 0,
                hasMore: false,
                loading: false,
              };
              return (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  title={column.label}
                  color={column.color}
                  cards={colData.items}
                  totalCount={colData.total}
                  hasMore={colData.hasMore}
                  loadingMore={colData.loading}
                  onLoadMore={() => loadMoreColumn(column.id)}
                  canEdit={canEditEntities}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeCard ? <KanbanCard entity={activeCard} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <EntityDetailPanel />

      {showCreateModal && (
        <CreateEntityModal
          workspaceId={workspaceId}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showFilters && (
        <FilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
