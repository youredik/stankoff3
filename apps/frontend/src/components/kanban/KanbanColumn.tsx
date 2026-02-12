'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2 } from 'lucide-react';
import { KanbanCard } from './KanbanCard';
import type { Entity } from '@/types';

interface KanbanColumnProps {
  id: string;
  title: string;
  color?: string;
  cards: Entity[];
  totalCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  canEdit?: boolean;
}

export function KanbanColumn({
  id,
  title,
  color,
  cards,
  totalCount,
  hasMore,
  loadingMore,
  onLoadMore,
  canEdit = true,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const remaining = totalCount - cards.length;

  return (
    <div
      className={`flex-shrink-0 w-80 px-4 border-r border-gray-300 dark:border-gray-600 last:border-r-0 transition-colors flex flex-col ${
        isOver ? 'bg-primary-100/50 dark:bg-primary-900/20' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {color && (
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
          )}
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <span className="bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded text-sm font-medium">
          {totalCount}
        </span>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        data-testid="kanban-column"
        data-status={id}
        className="space-y-3 flex-1 min-h-0 overflow-y-auto pb-4"
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard key={card.id} entity={card} canEdit={canEdit} />
          ))}
        </SortableContext>

        {/* Load more button */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors cursor-pointer disabled:cursor-wait"
          >
            {loadingMore ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              `Показать ещё (${remaining})`
            )}
          </button>
        )}
      </div>
    </div>
  );
}
