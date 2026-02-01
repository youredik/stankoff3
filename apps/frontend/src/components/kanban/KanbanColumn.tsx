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
        className={`bg-gray-50/80 backdrop-blur-sm rounded-2xl p-4 transition-all duration-200 ${
          isOver ? 'ring-2 ring-primary-400 bg-primary-50/50 shadow-glow' : ''
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
          <span className="bg-white text-gray-600 px-2.5 py-1 rounded-lg text-sm font-medium shadow-sm border border-gray-100">
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
              <div className="w-12 h-12 rounded-2xl bg-white shadow-soft flex items-center justify-center mb-3">
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
