'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link2, Calendar } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { Entity } from '@/types';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';
import { SlaTimer } from '@/components/sla/SlaTimer';

interface KanbanCardProps {
  entity: Entity;
  isDragging?: boolean;
  canEdit?: boolean;
}

export function KanbanCard({ entity, isDragging = false, canEdit = true }: KanbanCardProps) {
  const { openEntity } = useEntityNavigation();
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
        bg: 'bg-danger-100 dark:bg-danger-900/40',
        text: 'text-danger-600 dark:text-danger-400',
        border: 'border-danger-300 dark:border-danger-800',
        dot: 'bg-danger-500'
      };
      case 'medium': return {
        bg: 'bg-warning-100 dark:bg-warning-900/40',
        text: 'text-warning-600 dark:text-warning-400',
        border: 'border-warning-300 dark:border-warning-800',
        dot: 'bg-warning-500'
      };
      case 'low': return {
        bg: 'bg-success-100 dark:bg-success-900/40',
        text: 'text-success-600 dark:text-success-400',
        border: 'border-success-300 dark:border-success-800',
        dot: 'bg-success-500'
      };
      default: return {
        bg: 'bg-gray-200 dark:bg-gray-800',
        text: 'text-gray-600 dark:text-gray-400',
        border: 'border-gray-300 dark:border-gray-700',
        dot: 'bg-gray-500'
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
      onClick={() => !isDragging && openEntity(entity.id)}
      data-testid="kanban-card"
      data-entity-id={entity.id}
      className="bg-white dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-700 hover:border-primary-500/30 cursor-pointer transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-md">
          {entity.customId}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${priorityConfig.bg} ${priorityConfig.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot}`} />
          {getPriorityLabel(entity.priority)}
        </span>
      </div>

      {/* Title */}
      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 line-clamp-2">{entity.title}</h4>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {entity.assignee ? (
            <div className="flex items-center gap-2">
              <UserAvatar
                firstName={entity.assignee.firstName}
                lastName={entity.assignee.lastName}
                userId={entity.assignee.id}
                size="sm"
              />
              <span className="text-xs text-gray-400">
                {entity.assignee.firstName} {entity.assignee.lastName[0]}.
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-500">Не назначен</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SlaTimer targetId={entity.id} compact />
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>{format(entity.createdAt, 'dd.MM', { locale: ru })}</span>
          </div>
        </div>
      </div>

      {/* Links */}
      {entity.linkedEntityIds && entity.linkedEntityIds.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5 text-xs text-primary-400">
            <Link2 className="w-3 h-3" />
            <span>{entity.linkedEntityIds.length} связанных</span>
          </div>
        </div>
      )}
    </div>
  );
}
