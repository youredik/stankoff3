'use client';

import { useState } from 'react';
import { Bell, Search, Command } from 'lucide-react';
import { NotificationPanel } from './NotificationPanel';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAuthStore } from '@/store/useAuthStore';

export function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications } = useNotificationStore();
  const { user } = useAuthStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Получаем инициалы пользователя
  const getInitials = () => {
    if (!user) return 'U';
    const first = user.firstName?.[0] || '';
    const last = user.lastName?.[0] || '';
    return (first + last).toUpperCase() || user.email[0].toUpperCase();
  };

  const getFullName = () => {
    if (!user) return 'Пользователь';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Search */}
          <div className="flex-1 max-w-xl">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 transition-colors group-focus-within:text-primary-600" />
              <input
                type="text"
                placeholder="Поиск по заявкам..."
                className="w-full pl-10 pr-20 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors placeholder:text-gray-400"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-white rounded border border-gray-200 text-xs text-gray-400">
                <Command className="w-3 h-3" />
                <span>K</span>
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 ml-6">
            {/* Notifications */}
            <button
              data-testid="notification-bell"
              className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-5 h-5 text-gray-500 hover:text-gray-700" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-danger-500 text-white text-[10px] font-medium flex items-center justify-center rounded-full px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="w-px h-8 bg-gray-200" />

            {/* User */}
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-medium">{getInitials()}</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{getFullName()}</p>
                <p className="text-xs text-gray-500">{user?.department || user?.role || ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}
    </header>
  );
}
