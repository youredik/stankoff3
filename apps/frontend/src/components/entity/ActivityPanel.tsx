'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  UserPlus,
  MessageSquare,
  FileText,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { getEntityHistory } from '@/lib/api/audit-logs';
import type { AuditLog, AuditActionType } from '@/types';

interface ActivityPanelProps {
  entityId: string;
}

const ACTION_CONFIG: Record<
  AuditActionType,
  { icon: React.ElementType; label: string; color: string }
> = {
  'entity:created': { icon: Plus, label: 'Создание', color: 'text-green-600 bg-green-100' },
  'entity:updated': { icon: Pencil, label: 'Изменение', color: 'text-blue-600 bg-blue-100' },
  'entity:deleted': { icon: Trash2, label: 'Удаление', color: 'text-red-600 bg-red-100' },
  'entity:status:changed': { icon: ArrowRight, label: 'Статус', color: 'text-purple-600 bg-purple-100' },
  'entity:assignee:changed': { icon: UserPlus, label: 'Исполнитель', color: 'text-orange-600 bg-orange-100' },
  'comment:created': { icon: MessageSquare, label: 'Комментарий', color: 'text-cyan-600 bg-cyan-100' },
  'comment:updated': { icon: MessageSquare, label: 'Редакт. комментария', color: 'text-cyan-600 bg-cyan-100' },
  'comment:deleted': { icon: MessageSquare, label: 'Удален. комментария', color: 'text-gray-600 bg-gray-100' },
  'file:uploaded': { icon: FileText, label: 'Файл загружен', color: 'text-indigo-600 bg-indigo-100' },
  'file:deleted': { icon: FileText, label: 'Файл удалён', color: 'text-gray-600 bg-gray-100' },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getActorName(actor: AuditLog['actor']): string {
  if (!actor) return 'Система';
  const name = `${actor.firstName || ''} ${actor.lastName || ''}`.trim();
  return name || actor.email;
}

function renderChanges(log: AuditLog): React.ReactNode {
  const { details, action } = log;

  if (action === 'entity:status:changed' && details.oldValues && details.newValues) {
    return (
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">
          {details.oldValues.status}
        </span>
        <ArrowRight className="w-3 h-3 text-gray-400" />
        <span className="px-2 py-0.5 rounded bg-primary-100 text-primary-700">
          {details.newValues.status}
        </span>
      </div>
    );
  }

  if (action === 'entity:assignee:changed') {
    return (
      <div className="mt-1 text-xs text-gray-500">
        {details.newValues?.assigneeId
          ? 'Назначен новый исполнитель'
          : 'Исполнитель снят'}
      </div>
    );
  }

  if (details.changedFields && details.changedFields.length > 0) {
    return (
      <div className="mt-1 text-xs text-gray-500">
        Изменено: {details.changedFields.join(', ')}
      </div>
    );
  }

  return null;
}

export function ActivityPanel({ entityId }: ActivityPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    loadHistory();
  }, [entityId]);

  const loadHistory = async (append = false) => {
    try {
      setLoading(true);
      const result = await getEntityHistory(entityId, {
        limit: LIMIT,
        offset: append ? offset : 0,
        sort: 'newest',
      });
      if (append) {
        setLogs((prev) => [...prev, ...result.logs]);
      } else {
        setLogs(result.logs);
      }
      setHasMore(result.hasMore);
      setOffset(append ? offset + LIMIT : LIMIT);
    } catch (error) {
      console.error('Failed to load activity history:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    loadHistory(true);
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">История пока пуста</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const config = ACTION_CONFIG[log.action] || {
          icon: Clock,
          label: 'Действие',
          color: 'text-gray-600 bg-gray-100',
        };
        const Icon = config.icon;

        return (
          <div key={log.id} className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {getActorName(log.actor)}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">
                    {log.details.description}
                  </span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {formatDate(log.createdAt)}
                </span>
              </div>
              {renderChanges(log)}
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full py-2 text-sm text-primary-600 hover:text-primary-700 flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Показать ещё
            </>
          )}
        </button>
      )}
    </div>
  );
}
