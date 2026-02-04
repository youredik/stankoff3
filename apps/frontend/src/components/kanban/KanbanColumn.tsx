'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { KanbanCard } from './KanbanCard';
import type { Entity } from '@/types';

interface KanbanColumnProps {
  id: string;
  title: string;
  color?: string;
  cards: Entity[];
  canEdit?: boolean;
}

export function KanbanColumn({ id, title, color, cards, canEdit = true }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={`flex-shrink-0 w-80 px-4 border-r border-gray-300 dark:border-gray-600 last:border-r-0 transition-colors ${
        isOver ? 'bg-primary-100/50 dark:bg-primary-900/20' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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
          {cards.length}
        </span>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        data-testid="kanban-column"
        data-status={id}
        className="space-y-3 min-h-[200px]"
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard key={card.id} entity={card} canEdit={canEdit} />
          ))}
        </SortableContext>

      </div>
    </div>
  );
}
