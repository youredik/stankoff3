'use client';

import { useState, useEffect, useMemo } from 'react';
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
  applyFilters,
  isFilterActive,
  type FilterState,
} from './FilterPanel';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { Entity, FieldOption } from '@/types';

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

export function KanbanBoard({ workspaceId }: KanbanBoardProps) {
  const router = useRouter();
  const [activeCard, setActiveCard] = useState<Entity | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(createEmptyFilters);

  const { entities, loading, fetchEntities, fetchUsers, updateStatus } =
    useEntityStore();
  const { currentWorkspace, fetchWorkspace, canEdit, currentRole } = useWorkspaceStore();
  const { user } = useAuthStore();

  // Проверка прав: глобальный админ или workspace admin
  const isAdmin = user?.role === 'admin' || currentRole === 'admin';
  // Может ли редактировать (editor или admin)
  const canEditEntities = canEdit();

  useEffect(() => {
    fetchEntities(workspaceId);
    fetchUsers();
    fetchWorkspace(workspaceId);
  }, [workspaceId, fetchEntities, fetchUsers, fetchWorkspace]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Get status columns from workspace configuration
  const columns = useMemo(() => {
    if (!currentWorkspace?.sections) return DEFAULT_COLUMNS;

    // Find the status field in any section
    for (const section of currentWorkspace.sections) {
      const statusField = section.fields.find((f) => f.type === 'status');
      if (statusField?.options && statusField.options.length > 0) {
        return statusField.options;
      }
    }

    return DEFAULT_COLUMNS;
  }, [currentWorkspace]);

  // Apply filters to entities
  const filteredEntities = useMemo(() => {
    return applyFilters(entities, filters);
  }, [entities, filters]);

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

  const handleDragStart = (event: DragStartEvent) => {
    const card = filteredEntities.find((e) => e.id === event.active.id);
    if (card) setActiveCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    // Viewer не может менять статус
    if (!canEditEntities) return;

    if (!over || active.id === over.id) return;

    const overId = over.id as string;

    // Проверяем, является ли overId колонкой (статусом)
    const isColumn = columns.some((col) => col.id === overId);

    if (isColumn) {
      // Перетащили на колонку — меняем статус
      updateStatus(active.id as string, overId);
    } else {
      // Перетащили на другую карточку — находим её статус
      const targetCard = entities.find((e) => e.id === overId);
      if (targetCard) {
        updateStatus(active.id as string, targetCard.status);
      }
    }
  };

  const getColumnCards = (statusId: string) => {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return filteredEntities
      .filter((e) => e.status === statusId)
      .sort((a, b) => {
        // Сначала по приоритету (high > medium > low)
        const priorityDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
        if (priorityDiff !== 0) return priorityDiff;
        // Затем по дате создания (новые сверху)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  };

  const clearFilters = () => {
    setFilters(createEmptyFilters());
  };

  if (loading && entities.length === 0) {
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
                  {filteredEntities.length === entities.length
                    ? `${entities.length} заявок`
                    : `${filteredEntities.length} из ${entities.length} заявок`}
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
              {/* Настройки - только для админов */}
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
              {/* Создание заявки - только для editor+ */}
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

        {/* Индикатор режима просмотра */}
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
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.label}
                color={column.color}
                cards={getColumnCards(column.id)}
                canEdit={canEditEntities}
              />
            ))}
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
          onFiltersChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
