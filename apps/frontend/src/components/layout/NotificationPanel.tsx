'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Bell,
  BellRing,
  MessageSquare,
  UserCheck,
  RefreshCw,
  FileText,
  Briefcase,
  Settings,
} from 'lucide-react';
import { useNotificationStore, NotificationType } from '@/store/useNotificationStore';
import { useEntityStore } from '@/store/useEntityStore';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';

interface NotificationPanelProps {
  onClose: () => void;
}

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  entity: FileText,
  comment: MessageSquare,
  status: RefreshCw,
  assignment: UserCheck,
  mention: Bell,
  workspace: Briefcase,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  entity: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40',
  comment: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40',
  status: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40',
  assignment: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40',
  mention: 'text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/40',
  workspace: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40',
};

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { notifications, markAllRead, markRead, browserNotificationsEnabled, setBrowserNotificationsEnabled } = useNotificationStore();
  const { selectEntity } = useEntityStore();
  const { permission, isSupported, requestPermission } = useBrowserNotifications();
  const [showSettings, setShowSettings] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = async (notificationId: string, entityId?: string) => {
    markRead(notificationId);
    if (entityId) {
      await selectEntity(entityId);
    }
  };

  const handleToggleBrowserNotifications = async () => {
    if (!browserNotificationsEnabled) {
      // Включаем: запрашиваем разрешение если нужно
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (granted) {
          setBrowserNotificationsEnabled(true);
        }
      } else {
        setBrowserNotificationsEnabled(true);
      }
    } else {
      // Выключаем
      setBrowserNotificationsEnabled(false);
    }
  };

  return (
    <>
      {/* Backdrop for closing on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-6 top-16 w-96 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 shadow-xl z-50">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Уведомления</h3>
          {unreadCount > 0 && (
            <span className="bg-primary-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary-400 hover:text-primary-300 cursor-pointer"
            >
              Прочитать все
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer ${showSettings ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            title="Настройки уведомлений"
          >
            <Settings className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Settings section */}
      {showSettings && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Push-уведомления</span>
            </div>
            {isSupported ? (
              <button
                onClick={handleToggleBrowserNotifications}
                className={`relative inline-flex h-6 w-11 items-center rounded transition-colors cursor-pointer ${
                  browserNotificationsEnabled && permission === 'granted'
                    ? 'bg-primary-500'
                    : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded bg-white transition-transform ${
                    browserNotificationsEnabled && permission === 'granted'
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            ) : (
              <span className="text-xs text-gray-500">Не поддерживается</span>
            )}
          </div>
          {permission === 'denied' && (
            <p className="text-xs text-red-400 mt-2">
              Уведомления заблокированы в браузере. Разрешите их в настройках сайта.
            </p>
          )}
          {browserNotificationsEnabled && permission === 'granted' && (
            <p className="text-xs text-green-400 mt-2">
              Вы будете получать уведомления, когда вкладка не активна
            </p>
          )}
        </div>
      )}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 && (
          <div className="p-8 text-center">
            <Bell className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Нет уведомлений</p>
          </div>
        )}
        {notifications.map((notif) => {
          const Icon = notif.type ? NOTIFICATION_ICONS[notif.type] : Bell;
          const colorClass = notif.type
            ? NOTIFICATION_COLORS[notif.type]
            : 'text-gray-500 bg-gray-800';

          return (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif.id, notif.entityId)}
              className={`p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer flex items-start gap-3 transition-colors ${
                !notif.read ? 'bg-primary-100 dark:bg-primary-900/20' : ''
              }`}
            >
              <div className={`p-2 rounded ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!notif.read ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
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
                <div className="w-2 h-2 bg-primary-500 rounded flex-shrink-0 mt-2" />
              )}
            </div>
          );
        })}
      </div>
      {notifications.length > 0 && (
        <div className="p-3 text-center border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-300 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
    </>
  );
}
