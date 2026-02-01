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
}

export function KanbanColumn({ id, title, color, cards }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex-shrink-0 w-80">
      <div
        className={`bg-gray-100 rounded-lg p-4 transition-colors ${
          isOver ? 'ring-2 ring-primary-400 bg-primary-50' : ''
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {color && (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-sm font-medium">
            {cards.length}
          </span>
        </div>

        <div ref={setNodeRef} data-testid="kanban-column" data-status={id} className="space-y-3 min-h-[200px]">
          <SortableContext
            items={cards.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => (
              <KanbanCard key={card.id} entity={card} />
            ))}
          </SortableContext>

          {cards.length === 0 && (
            <div className="flex items-center justify-center h-24 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              Нет заявок
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
