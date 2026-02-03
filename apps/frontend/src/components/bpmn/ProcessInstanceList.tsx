'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { ProcessInstance, ProcessInstanceStatus } from '@/types';

const STATUS_CONFIG: Record<
  ProcessInstanceStatus,
  { label: string; icon: typeof Play; color: string; bg: string }
> = {
  active: {
    label: 'Активен',
    icon: Play,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  completed: {
    label: 'Завершён',
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
  terminated: {
    label: 'Прерван',
    icon: XCircle,
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
  },
  incident: {
    label: 'Ошибка',
    icon: AlertTriangle,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
};

interface ProcessInstanceListProps {
  instances: ProcessInstance[];
  onViewEntity?: (entityId: string) => void;
  showEntityLink?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ProcessInstanceList({
  instances,
  onViewEntity,
  showEntityLink = true,
  isLoading = false,
  emptyMessage = 'Нет запущенных процессов',
}: ProcessInstanceListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {instances.map((instance) => {
        const statusConfig = STATUS_CONFIG[instance.status];
        const StatusIcon = statusConfig.icon;
        const isExpanded = expandedId === instance.id;

        return (
          <div
            key={instance.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : instance.id)}
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
            >
              <button className="text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}
              >
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {instance.businessKey || instance.processInstanceKey}
                </span>
              </div>

              <div className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(instance.startedAt), 'd MMM HH:mm', {
                  locale: ru,
                })}
              </div>

              {showEntityLink && instance.entityId && onViewEntity && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewEntity(instance.entityId!);
                  }}
                  className="p-1 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded"
                  title="Открыть заявку"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-gray-500 dark:text-gray-400">Instance Key</dt>
                  <dd className="font-mono text-gray-900 dark:text-white">
                    {instance.processInstanceKey}
                  </dd>

                  <dt className="text-gray-500 dark:text-gray-400">Definition Key</dt>
                  <dd className="font-mono text-gray-900 dark:text-white">
                    {instance.processDefinitionKey}
                  </dd>

                  <dt className="text-gray-500 dark:text-gray-400">Запущен</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {format(new Date(instance.startedAt), 'd MMMM yyyy, HH:mm:ss', {
                      locale: ru,
                    })}
                  </dd>

                  {instance.completedAt && (
                    <>
                      <dt className="text-gray-500 dark:text-gray-400">Завершён</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {format(
                          new Date(instance.completedAt),
                          'd MMMM yyyy, HH:mm:ss',
                          { locale: ru },
                        )}
                      </dd>
                    </>
                  )}

                  {instance.entityId && (
                    <>
                      <dt className="text-gray-500 dark:text-gray-400">Entity ID</dt>
                      <dd className="font-mono text-gray-900 dark:text-white truncate">
                        {instance.entityId}
                      </dd>
                    </>
                  )}
                </dl>

                {/* Variables */}
                {Object.keys(instance.variables).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                      Переменные
                    </h4>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                      {JSON.stringify(instance.variables, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ProcessInstanceList;
