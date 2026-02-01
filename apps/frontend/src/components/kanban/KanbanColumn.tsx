'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Inbox } from 'lucide-react';
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
        className={`bg-gray-50 rounded-xl p-4 transition-colors ${
          isOver ? 'ring-2 ring-primary-500 bg-primary-50' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {color && (
              <div
                className="w-3 h-3 rounded-full shadow-sm"
                style={{ backgroundColor: color }}
              />
            )}
            <h3 className="font-semibold text-gray-900">{title}</h3>
          </div>
          <span className="bg-white text-gray-600 px-2 py-0.5 rounded text-sm font-medium border border-gray-200">
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
              <KanbanCard key={card.id} entity={card} />
            ))}
          </SortableContext>

          {cards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center mb-3">
                <Inbox className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">Нет заявок</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
