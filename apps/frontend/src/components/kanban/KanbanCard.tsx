'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link2, Calendar } from 'lucide-react';
import type { Entity } from '@/types';
import { useEntityStore } from '@/store/useEntityStore';

interface KanbanCardProps {
  entity: Entity;
  isDragging?: boolean;
  canEdit?: boolean;
}

export function KanbanCard({ entity, isDragging = false, canEdit = true }: KanbanCardProps) {
  const { selectEntity } = useEntityStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: entity.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityConfig = (priority?: string) => {
    switch(priority) {
      case 'high': return {
        bg: 'bg-danger-50',
        text: 'text-danger-700',
        border: 'border-danger-200',
        dot: 'bg-danger-500'
      };
      case 'medium': return {
        bg: 'bg-warning-50',
        text: 'text-warning-700',
        border: 'border-warning-200',
        dot: 'bg-warning-500'
      };
      case 'low': return {
        bg: 'bg-success-50',
        text: 'text-success-700',
        border: 'border-success-200',
        dot: 'bg-success-500'
      };
      default: return {
        bg: 'bg-gray-50',
        text: 'text-gray-600',
        border: 'border-gray-200',
        dot: 'bg-gray-400'
      };
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

  const priorityConfig = getPriorityConfig(entity.priority);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && selectEntity(entity.id)}
      data-testid="kanban-card"
      data-entity-id={entity.id}
      className="bg-white p-4 rounded-lg border border-gray-200 shadow-soft hover:shadow-soft-lg cursor-pointer transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
          {entity.customId}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${priorityConfig.bg} ${priorityConfig.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot}`} />
          {getPriorityLabel(entity.priority)}
        </span>
      </div>

      {/* Title */}
      <h4 className="font-medium text-gray-900 mb-3 line-clamp-2">{entity.title}</h4>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {entity.assignee ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary-600 rounded flex items-center justify-center">
                <span className="text-white text-[10px] font-medium">
                  {entity.assignee.firstName[0]}{entity.assignee.lastName[0]}
                </span>
              </div>
              <span className="text-xs text-gray-600">
                {entity.assignee.firstName} {entity.assignee.lastName[0]}.
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">Не назначен</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Calendar className="w-3 h-3" />
          <span>{format(entity.createdAt, 'dd.MM', { locale: ru })}</span>
        </div>
      </div>

      {/* Links */}
      {entity.linkedEntityIds && entity.linkedEntityIds.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-primary-600">
            <Link2 className="w-3 h-3" />
            <span>{entity.linkedEntityIds.length} связанных</span>
          </div>
        </div>
      )}
    </div>
  );
}
