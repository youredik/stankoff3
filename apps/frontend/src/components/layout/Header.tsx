'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Bell, MessageSquare, LayoutGrid, BarChart3, List, Menu, LogOut, ChevronDown } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { NotificationPanel } from './NotificationPanel';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export type DashboardView = 'kanban' | 'table' | 'analytics';

const VIEW_KEY = 'stankoff-dashboard-view';

function HeaderInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { currentWorkspace } = useWorkspaceStore();

  // Показываем view toggle только на основной странице workspace (не settings/processes/системных)
  const isWorkspacePage = pathname.startsWith('/workspace/') &&
    !pathname.includes('/settings') &&
    !pathname.includes('/processes') &&
    !currentWorkspace?.isSystem;

  const currentView = (searchParams.get('view') as DashboardView) || 'kanban';

  const handleViewChange = useCallback((view: DashboardView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'kanban') {
      params.delete('view'); // kanban — default, не засоряем URL
    } else {
      params.set('view', view);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? '?' + qs : ''}`);
    localStorage.setItem(VIEW_KEY, view);
  }, [router, pathname, searchParams]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { notifications } = useNotificationStore();
  const { user, logout } = useAuthStore();
  const { toggle: toggleSidebar } = useSidebarStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Chat unread counts
  const chatUnreadCounts = useChatStore((s) => s.unreadCounts);
  const fetchUnreadCounts = useChatStore((s) => s.fetchUnreadCounts);
  const totalChatUnread = Object.values(chatUnreadCounts).reduce((sum, c) => sum + c, 0);

  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
  };

  const getFullName = () => {
    if (!user) return 'Пользователь';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  return (
    <header data-testid="header" className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40 flex-shrink-0">
      <div className="px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Mobile menu button */}
          <button
            onClick={toggleSidebar}
            aria-label="Открыть меню"
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <GlobalSearch />

          {/* View Toggle — только на основной странице workspace */}
          {isWorkspacePage && (
            <div className="flex items-center gap-1 mx-6 p-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
              <button
                onClick={() => handleViewChange('kanban')}
                data-testid="view-toggle-kanban"
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  currentView === 'kanban'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Канбан</span>
              </button>
              <button
                onClick={() => handleViewChange('table')}
                data-testid="view-toggle-table"
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  currentView === 'table'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <List className="w-4 h-4" />
                <span>Таблица</span>
              </button>
              <button
                onClick={() => handleViewChange('analytics')}
                data-testid="view-toggle-analytics"
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  currentView === 'analytics'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Аналитика</span>
              </button>
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Chat */}
            <button
              data-testid="header-chat-btn"
              aria-label="Чат"
              className={`relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer ${
                pathname === '/chat' ? 'text-primary-500' : ''
              }`}
              onClick={() => router.push('/chat')}
            >
              <MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              {totalChatUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-primary-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full px-1">
                  {totalChatUnread > 9 ? '9+' : totalChatUnread}
                </span>
              )}
            </button>

            {/* Notifications */}
            <button
              data-testid="notification-bell"
              aria-label="Уведомления"
              aria-expanded={showNotifications}
              aria-haspopup="true"
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors cursor-pointer"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-primary-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                data-testid="user-menu-button"
                className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <UserAvatar
                  firstName={user?.firstName}
                  lastName={user?.lastName}
                  email={user?.email}
                  size="md"
                  showOnline={false}
                />
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{getFullName()}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user?.department || user?.role || ''}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 hidden sm:block" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 sm:hidden">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{getFullName()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Выйти
                    </button>
                  </div>
                </>
              )}
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

export function Header() {
  return (
    <Suspense>
      <HeaderInner />
    </Suspense>
  );
}
