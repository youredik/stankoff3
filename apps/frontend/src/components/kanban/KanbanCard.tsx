'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Entity } from '@/types';
import { useEntityStore } from '@/store/useEntityStore';

interface KanbanCardProps {
  entity: Entity;
  isDragging?: boolean;
}

export function KanbanCard({ entity, isDragging = false }: KanbanCardProps) {
  const { selectEntity } = useEntityStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: entity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityColor = (priority?: string) => {
    switch(priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityLabel = (priority?: string) => {
    switch(priority) {
      case 'high': return 'Высокий';
      case 'medium': return 'Средний';
      case 'low': return 'Низкий';
      default: return 'Обычный';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && selectEntity(entity.id)}
      data-testid="kanban-card"
      data-entity-id={entity.id}
      className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-gray-500">{entity.customId}</span>
        <span className={`px-2 py-1 text-xs font-medium rounded border ${getPriorityColor(entity.priority)}`}>
          {getPriorityLabel(entity.priority)}
        </span>
      </div>
      
      <h4 className="font-medium text-gray-900 mb-3">{entity.title}</h4>
      
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-2">
          {entity.assignee && (
            <>
              <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {entity.assignee.firstName[0]}{entity.assignee.lastName[0]}
                </span>
              </div>
              <span className="text-xs">
                {entity.assignee.firstName} {entity.assignee.lastName[0]}.
              </span>
            </>
          )}
        </div>
        <span className="text-xs">
          {format(entity.createdAt, 'dd.MM.yyyy', { locale: ru })}
        </span>
      </div>

      {entity.linkedEntityIds && entity.linkedEntityIds.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-primary-600">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>Связано: {entity.linkedEntityIds[0]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
