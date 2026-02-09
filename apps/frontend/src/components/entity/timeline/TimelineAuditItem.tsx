import { Clock } from 'lucide-react';
import {
  ACTION_CONFIG,
  formatDate,
  getActorName,
  renderChanges,
} from '@/components/entity/ActivityPanel';
import type { AuditLog, FieldOption } from '@/types';

interface TimelineAuditItemProps {
  log: AuditLog;
  statusOptions?: FieldOption[];
}

export function TimelineAuditItem({ log, statusOptions }: TimelineAuditItemProps) {
  const config = ACTION_CONFIG[log.action] || {
    icon: Clock,
    label: 'Действие',
    color: 'text-gray-600 bg-gray-100',
  };
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {getActorName(log.actor)}
            </span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">
              {log.details.description}
            </span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {formatDate(log.createdAt)}
          </span>
        </div>
        {renderChanges(log, statusOptions)}
      </div>
    </div>
  );
}
