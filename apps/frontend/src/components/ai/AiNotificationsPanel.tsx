'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Bell,
  AlertTriangle,
  TrendingUp,
  Copy,
  X,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { aiApi } from '@/lib/api/ai';
import type { AiNotificationItem, AiNotificationType } from '@/types/ai';

const TYPE_CONFIG: Record<AiNotificationType, {
  icon: typeof AlertTriangle;
  color: string;
  bgColor: string;
}> = {
  cluster_detected: {
    icon: TrendingUp,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
  },
  critical_entity: {
    icon: AlertTriangle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
  },
  sla_risk: {
    icon: Bell,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  duplicate_suspected: {
    icon: Copy,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  trend_anomaly: {
    icon: TrendingUp,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
  },
};

interface AiNotificationsPanelProps {
  workspaceId?: string;
  onNavigateToEntity?: (entityId: string) => void;
}

export function AiNotificationsPanel({ workspaceId, onNavigateToEntity }: AiNotificationsPanelProps) {
  const [notifications, setNotifications] = useState<AiNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const result = await aiApi.getNotifications({
        workspaceId,
        limit: 10,
      });
      setNotifications(result.notifications);
      setTotal(result.total);
    } catch {
      // Graceful degradation
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleDismiss = async (id: string) => {
    try {
      await aiApi.dismissNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => prev - 1);
    } catch {
      // ignore
    }
  };

  const handleMarkRead = async (notification: AiNotificationItem) => {
    if (!notification.read) {
      try {
        await aiApi.markNotificationRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
        );
      } catch {
        // ignore
      }
    }

    if (notification.entityId && onNavigateToEntity) {
      onNavigateToEntity(notification.entityId);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await aiApi.markAllNotificationsRead(workspaceId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Sparkles className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">Нет AI уведомлений</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-xs text-gray-500">
            {unreadCount} непрочитанн{unreadCount === 1 ? 'ое' : 'ых'}
          </span>
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 transition-colors"
          >
            <Check className="w-3 h-3" />
            Прочитать все
          </button>
        </div>
      )}

      {/* Notifications list */}
      {notifications.map((notification) => {
        const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.cluster_detected;
        const Icon = config.icon;
        const timeAgo = getTimeAgo(notification.createdAt);

        return (
          <div
            key={notification.id}
            className={`relative rounded-lg border transition-colors ${
              notification.read
                ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                : `border-gray-300 dark:border-gray-600 ${config.bgColor}`
            }`}
          >
            <button
              onClick={() => handleMarkRead(notification)}
              className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-2">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${notification.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{timeAgo}</span>
                    {notification.confidence > 0 && (
                      <span className="text-xs text-gray-400">
                        {Math.round(Number(notification.confidence) * 100)}% уверенность
                      </span>
                    )}
                    {notification.entityId && (
                      <span className="flex items-center gap-0.5 text-xs text-teal-600 dark:text-teal-400">
                        Открыть <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* Dismiss button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss(notification.id);
              }}
              className="absolute top-2 right-2 p-1 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
              title="Скрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {total > notifications.length && (
        <p className="text-xs text-center text-gray-400 pt-1">
          + ещё {total - notifications.length} уведомлений
        </p>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  return `${days}д назад`;
}
