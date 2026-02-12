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
  pointerWithin,
  closestCenter,
  type CollisionDetection,
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
import { usePermissionCan } from '@/store/usePermissionStore';
import type { Entity, FieldOption } from '@/types';
import { filtersToApi } from '@/lib/utils/filters';
import { useWorkspaceFilters } from '@/hooks/useWorkspaceFilters';
import { useFacets } from '@/hooks/useFacets';

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

// Кастомный алгоритм коллизий для канбана:
// pointerWithin — если указатель внутри столбца, берём его (точное попадание)
// closestCenter — fallback, когда указатель вне droppable-зон (между столбцами или ниже)
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCenter(args);
};

export function KanbanBoard({ workspaceId }: KanbanBoardProps) {
  const router = useRouter();
  const [activeCard, setActiveCard] = useState<Entity | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [mobileColumn, setMobileColumn] = useState<string | null>(null);
  const [filters, setFilters] = useWorkspaceFilters(workspaceId);
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
  const { currentWorkspace, fetchWorkspace, canEdit } = useWorkspaceStore();
  const { user } = useAuthStore();
  const can = usePermissionCan();

  const isAdmin = can('workspace:settings:read', workspaceId);
  const canEditEntities = can('workspace:entity:update', workspaceId);
  const { facets } = useFacets(workspaceId, filters);

  useEffect(() => {
    const apiFilters = filtersToApi(filters);
    // Always sync store filters — clears stale filters from previous workspace
    useEntityStore.setState({ kanbanFilters: apiFilters });
    fetchKanban(workspaceId, apiFilters);
    fetchUsers();
    fetchWorkspace(workspaceId);
  }, [workspaceId, fetchKanban, fetchUsers, fetchWorkspace]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Инициализируем мобильную колонку первым статусом
  useEffect(() => {
    if (columns.length > 0 && !mobileColumn) {
      setMobileColumn(columns[0].id);
    }
  }, [columns, mobileColumn]);

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
    [setFilters, setKanbanFilters],
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
      <div className="flex gap-4 overflow-x-auto flex-1 min-h-0">
        <SkeletonColumn />
        <SkeletonColumn />
        <SkeletonColumn />
        <SkeletonColumn />
      </div>
    );
  }

  return (
    <div data-testid="kanban-board" className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
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
                data-testid="kanban-filter-button"
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors cursor-pointer backdrop-blur-sm ${
                  activeFilterCount > 0
                    ? 'border-primary-300 dark:border-primary-700 bg-primary-50/80 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Filter className="w-5 h-5" />
                <span className="hidden sm:inline">Фильтры</span>
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
                  <span className="hidden sm:inline">Сбросить</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => router.push(`/workspace/${workspaceId}/settings`)}
                  aria-label="Настройки рабочего места"
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white/60 dark:bg-gray-800/60 hover:bg-white/80 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer backdrop-blur-sm"
                >
                  <Settings className="w-5 h-5" />
                  <span className="hidden sm:inline">Настройки</span>
                </button>
              )}
              {canEditEntities && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  aria-label="Создать новую заявку"
                  data-testid="kanban-new-entity-button"
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">Новая заявка</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {!canEditEntities && can('workspace:entity:read', workspaceId) && (
          <div data-testid="kanban-view-mode-badge" className="mb-4 flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-gray-100/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Режим просмотра — вы можете просматривать заявки, но не можете их редактировать</span>
          </div>
        )}

        {/* Mobile: single column with status tabs */}
        <div className="md:hidden flex flex-col flex-1 min-h-0">
          <div className="flex gap-1 overflow-x-auto pb-3 flex-shrink-0">
            {columns.map((col) => {
              const colData = kanbanColumns[col.id];
              const count = colData?.total ?? 0;
              const isActive = mobileColumn === col.id;
              return (
                <button
                  key={col.id}
                  onClick={() => setMobileColumn(col.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {col.color && (
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  )}
                  {col.label}
                  <span className="text-xs opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pb-4">
            {(() => {
              const colData = mobileColumn ? kanbanColumns[mobileColumn] : null;
              if (!colData) return null;
              return (
                <>
                  {colData.items.map((card) => (
                    <KanbanCard key={card.id} entity={card} canEdit={canEditEntities} />
                  ))}
                  {colData.hasMore && (
                    <button
                      onClick={() => mobileColumn && loadMoreColumn(mobileColumn)}
                      disabled={colData.loading}
                      className="w-full py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 rounded-lg transition-colors"
                    >
                      {colData.loading ? 'Загрузка...' : `Показать ещё (${colData.total - colData.items.length})`}
                    </button>
                  )}
                  {colData.items.length === 0 && (
                    <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">Нет заявок</p>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Desktop: full kanban with drag & drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={kanbanCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="hidden md:flex overflow-x-auto flex-1 min-h-0">
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
          facets={facets}
        />
      )}
    </div>
  );
}
