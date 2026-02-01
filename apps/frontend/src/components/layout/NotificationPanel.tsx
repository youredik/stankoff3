'use client';

import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Bell,
  MessageSquare,
  UserCheck,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { useNotificationStore, NotificationType } from '@/store/useNotificationStore';
import { useEntityStore } from '@/store/useEntityStore';

interface NotificationPanelProps {
  onClose: () => void;
}

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  entity: FileText,
  comment: MessageSquare,
  status: RefreshCw,
  assignment: UserCheck,
  mention: Bell,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  entity: 'text-blue-500 bg-blue-100',
  comment: 'text-green-500 bg-green-100',
  status: 'text-orange-500 bg-orange-100',
  assignment: 'text-purple-500 bg-purple-100',
  mention: 'text-pink-500 bg-pink-100',
};

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { notifications, markAllRead, markRead } = useNotificationStore();
  const { selectEntity } = useEntityStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (notificationId: string, entityId?: string) => {
    markRead(notificationId);
    if (entityId) {
      await selectEntity(entityId);
    }
  };

  return (
    <div className="absolute right-6 top-16 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Уведомления</h3>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            Прочитать все
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 && (
          <div className="p-8 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Нет уведомлений</p>
          </div>
        )}
        {notifications.map((notif) => {
          const Icon = notif.type ? NOTIFICATION_ICONS[notif.type] : Bell;
          const colorClass = notif.type
            ? NOTIFICATION_COLORS[notif.type]
            : 'text-gray-500 bg-gray-100';

          return (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif.id, notif.entityId)}
              className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer flex items-start gap-3 transition-colors ${
                !notif.read ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className={`p-2 rounded-full ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!notif.read ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                  {notif.text}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDistanceToNow(notif.time, {
                    addSuffix: true,
                    locale: ru,
                  })}
                </p>
              </div>
              {!notif.read && (
                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
              )}
            </div>
          );
        })}
      </div>
      {notifications.length > 0 && (
        <div className="p-3 text-center border-t border-gray-200">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}
