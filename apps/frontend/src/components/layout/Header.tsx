'use client';

import { useState } from 'react';
import { Bell, Search, Command } from 'lucide-react';
import { NotificationPanel } from './NotificationPanel';
import { useNotificationStore } from '@/store/useNotificationStore';

export function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications } = useNotificationStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-40">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Search */}
          <div className="flex-1 max-w-xl">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 transition-colors group-focus-within:text-primary-500" />
              <input
                type="text"
                placeholder="Поиск по заявкам..."
                className="w-full pl-11 pr-20 py-2.5 bg-gray-100/80 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300 focus:bg-white transition-all duration-200 placeholder:text-gray-400"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-400">
                <Command className="w-3 h-3" />
                <span>K</span>
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 ml-6">
            {/* Notifications */}
            <button
              className="relative p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 group"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-gradient-to-r from-danger-500 to-danger-600 text-white text-[10px] font-medium flex items-center justify-center rounded-full shadow-sm px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="w-px h-8 bg-gray-200" />

            {/* User */}
            <button className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-100 rounded-xl transition-all duration-200">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-soft">
                <span className="text-white text-sm font-semibold">АП</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Алексей Петров</p>
                <p className="text-xs text-gray-500">Тех. поддержка</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}
    </header>
  );
}
