'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Bell,
  MessageSquare,
  UserCheck,
  RefreshCw,
  FileText,
  Briefcase,
  X,
} from 'lucide-react';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useEntityStore } from '@/store/useEntityStore';
import type { AppNotification, NotificationType } from '@/store/useNotificationStore';

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  entity: FileText,
  comment: MessageSquare,
  status: RefreshCw,
  assignment: UserCheck,
  mention: Bell,
  workspace: Briefcase,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  entity: 'text-blue-500 bg-blue-100 dark:bg-blue-900/40',
  comment: 'text-green-500 bg-green-100 dark:bg-green-900/40',
  status: 'text-orange-500 bg-orange-100 dark:bg-orange-900/40',
  assignment: 'text-purple-500 bg-purple-100 dark:bg-purple-900/40',
  mention: 'text-pink-500 bg-pink-100 dark:bg-pink-900/40',
  workspace: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40',
};

export function ToastContainer() {
  const { notifications } = useNotificationStore();
  const { selectEntity } = useEntityStore();
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    // Найти новые уведомления, которые ещё не показывались как Toast
    const newNotifications = notifications.filter(
      (n) => !n.read && !shownIdsRef.current.has(n.id)
    );

    if (newNotifications.length === 0) return;

    // Добавить новые toast'ы
    for (const notification of newNotifications) {
      shownIdsRef.current.add(notification.id);
      setToasts((prev) => [...prev, notification]);

      // Установить таймер для автоматического закрытия
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== notification.id));
        timersRef.current.delete(notification.id);
      }, 3000);

      timersRef.current.set(notification.id, timer);
    }
  }, [notifications]);

  // Очистка всех таймеров при размонтировании
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleDismiss = (id: string) => {
    // Очистить таймер если есть
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClick = async (toast: AppNotification) => {
    if (toast.entityId) {
      await selectEntity(toast.entityId);
    }
    handleDismiss(toast.id);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toast.type ? NOTIFICATION_ICONS[toast.type] : Bell;
        const colorClass = toast.type
          ? NOTIFICATION_COLORS[toast.type]
          : 'text-gray-500 bg-gray-100 dark:bg-gray-800';

        return (
          <div
            key={toast.id}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-4 py-3 max-w-sm pointer-events-auto flex items-start gap-3 animate-slide-in"
            style={{
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <div className={`p-2 rounded-full flex-shrink-0 ${colorClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div
              className="flex-1 cursor-pointer"
              onClick={() => handleClick(toast)}
            >
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{toast.text}</p>
              {toast.entityId && (
                <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">Нажмите, чтобы открыть</p>
              )}
            </div>
            <button
              onClick={() => handleDismiss(toast.id)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
