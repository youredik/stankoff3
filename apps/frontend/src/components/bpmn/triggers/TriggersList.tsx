'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Plus,
  Zap,
  Clock,
  Calendar,
  Webhook,
  MessageSquare,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Edit,
  Activity,
  RefreshCw,
} from 'lucide-react';
import type { ProcessTrigger, TriggerType, ProcessDefinition } from '@/types';
import { triggersApi } from '@/lib/api/triggers';

interface TriggersListProps {
  workspaceId: string;
  definitions: ProcessDefinition[];
  onCreateTrigger?: () => void;
  onEditTrigger?: (trigger: ProcessTrigger) => void;
}

const triggerTypeConfig: Record<
  TriggerType,
  { label: string; icon: React.ElementType; color: string }
> = {
  entity_created: {
    label: 'Создание заявки',
    icon: Plus,
    color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
  },
  status_changed: {
    label: 'Изменение статуса',
    icon: Activity,
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  },
  assignee_changed: {
    label: 'Смена исполнителя',
    icon: Zap,
    color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
  },
  comment_added: {
    label: 'Новый комментарий',
    icon: MessageSquare,
    color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
  },
  cron: {
    label: 'По расписанию',
    icon: Calendar,
    color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
  },
  webhook: {
    label: 'Webhook',
    icon: Webhook,
    color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30',
  },
  message: {
    label: 'Сообщение',
    icon: MessageSquare,
    color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
  },
};

export function TriggersList({
  workspaceId,
  definitions,
  onCreateTrigger,
  onEditTrigger,
}: TriggersListProps) {
  const [triggers, setTriggers] = useState<ProcessTrigger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTriggers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await triggersApi.getByWorkspace(workspaceId);
      setTriggers(data);
    } catch (err) {
      setError('Не удалось загрузить триггеры');
      console.error('Failed to fetch triggers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchTriggers();
  }, [fetchTriggers]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTriggers();
    setIsRefreshing(false);
  };

  const handleToggle = async (trigger: ProcessTrigger) => {
    try {
      const updated = await triggersApi.toggle(trigger.id);
      setTriggers((prev) =>
        prev.map((t) => (t.id === trigger.id ? updated : t))
      );
    } catch (err) {
      console.error('Failed to toggle trigger:', err);
    }
  };

  const handleDelete = async (triggerId: string) => {
    if (!confirm('Удалить триггер?')) return;
    try {
      await triggersApi.delete(triggerId);
      setTriggers((prev) => prev.filter((t) => t.id !== triggerId));
    } catch (err) {
      console.error('Failed to delete trigger:', err);
    }
  };

  const getDefinitionName = (definitionId: string): string => {
    const def = definitions.find((d) => d.id === definitionId);
    return def?.name || 'Неизвестный процесс';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Триггеры процессов
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {onCreateTrigger && (
            <button
              onClick={onCreateTrigger}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              Создать триггер
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* List */}
      {triggers.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Zap className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Нет настроенных триггеров
          </p>
          {onCreateTrigger && (
            <button
              onClick={onCreateTrigger}
              className="text-teal-600 hover:text-teal-700 font-medium"
            >
              Создать первый триггер
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger) => {
            const config = triggerTypeConfig[trigger.triggerType];
            const Icon = config?.icon || Zap;

            return (
              <div
                key={trigger.id}
                className={`p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-opacity ${
                  !trigger.isActive ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Type icon */}
                    <div className={`p-2 rounded-lg ${config?.color || 'text-gray-600 bg-gray-100'}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      {/* Name */}
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {trigger.name || config?.label || trigger.triggerType}
                      </h3>

                      {/* Process */}
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Процесс: {getDefinitionName(trigger.processDefinitionId)}
                      </p>

                      {/* Conditions */}
                      {trigger.triggerType === 'cron' && trigger.conditions.expression && (
                        <p className="text-xs text-gray-400 mt-1 font-mono">
                          {trigger.conditions.expression}
                        </p>
                      )}
                      {trigger.triggerType === 'status_changed' && (
                        <p className="text-xs text-gray-400 mt-1">
                          {trigger.conditions.fromStatus && `${trigger.conditions.fromStatus} → `}
                          {trigger.conditions.toStatus || 'любой статус'}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {trigger.triggerCount} срабатываний
                        </span>
                        {trigger.lastTriggeredAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(trigger.lastTriggeredAt), {
                              addSuffix: true,
                              locale: ru,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Active status */}
                    <button
                      onClick={() => handleToggle(trigger)}
                      className={`p-1.5 rounded transition-colors ${
                        trigger.isActive
                          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={trigger.isActive ? 'Отключить' : 'Включить'}
                    >
                      {trigger.isActive ? (
                        <Play className="w-4 h-4" />
                      ) : (
                        <Pause className="w-4 h-4" />
                      )}
                    </button>

                    {/* Menu */}
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === trigger.id ? null : trigger.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpenId === trigger.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
                            {onEditTrigger && (
                              <button
                                onClick={() => {
                                  setMenuOpenId(null);
                                  onEditTrigger(trigger);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <Edit className="w-4 h-4" />
                                Редактировать
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                handleDelete(trigger.id);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-4 h-4" />
                              Удалить
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TriggersList;
