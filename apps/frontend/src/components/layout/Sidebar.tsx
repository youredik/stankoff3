'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, MoreVertical, Pencil, Trash2, Sparkles, LogOut } from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { Workspace } from '@/types';

interface SidebarProps {
  selectedWorkspace: string;
  onWorkspaceChange: (id: string) => void;
}

export function Sidebar({ selectedWorkspace, onWorkspaceChange }: SidebarProps) {
  const router = useRouter();
  const { workspaces, fetchWorkspaces, createWorkspace, deleteWorkspace } =
    useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Проверка прав администратора
  const isAdmin = user?.role === 'admin';

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

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleCreateWorkspace = async () => {
    setCreating(true);
    try {
      const newWorkspace = await createWorkspace({
        name: 'Новое рабочее место',
        icon: '📋',
      });
      router.push(`/workspace/${newWorkspace.id}/settings`);
    } finally {
      setCreating(false);
    }
  };

  const handleEditWorkspace = (id: string) => {
    setMenuOpen(null);
    router.push(`/workspace/${id}/settings`);
  };

  const handleDeleteWorkspace = async (id: string) => {
    setMenuOpen(null);
    if (window.confirm('Удалить рабочее место? Все сущности будут удалены.')) {
      await deleteWorkspace(id);
      if (selectedWorkspace === id && workspaces.length > 1) {
        const next = workspaces.find((w) => w.id !== id);
        if (next) onWorkspaceChange(next.id);
      }
    }
  };

  return (
    <aside className="w-72 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Stankoff</h1>
            <p className="text-xs text-gray-500">Портал управления</p>
          </div>
        </div>
      </div>

      <nav className="p-4 flex-1 overflow-y-auto">
        {/* Create button - только для админов */}
        {isAdmin && (
          <div className="mb-6">
            <button
              onClick={handleCreateWorkspace}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">
                {creating ? 'Создаём...' : 'Создать рабочее место'}
              </span>
            </button>
          </div>
        )}

        {/* Workspaces */}
        <div className="space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Рабочие места
          </div>

          {workspaces.length === 0 && (
            <div className="px-3 py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-100 flex items-center justify-center">
                <span className="text-2xl opacity-50">📭</span>
              </div>
              <p className="text-sm text-gray-400">
                Нет рабочих мест
              </p>
            </div>
          )}

          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className={`group relative flex items-center rounded-lg transition-colors ${
                selectedWorkspace === workspace.id
                  ? 'bg-primary-50'
                  : 'hover:bg-gray-50'
              }`}
            >
              <button
                onClick={() => onWorkspaceChange(workspace.id)}
                className={`flex-1 flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                  selectedWorkspace === workspace.id
                    ? 'text-primary-700'
                    : 'text-gray-700'
                }`}
              >
                <span className="text-xl">{workspace.icon}</span>
                <span className="font-medium truncate">{workspace.name}</span>
                {selectedWorkspace === workspace.id && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />
                )}
              </button>

              {/* Меню настроек - только для админов */}
              {isAdmin && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === workspace.id ? null : workspace.id);
                    }}
                    className="p-1.5 mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuOpen === workspace.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpen(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-soft-lg py-1 w-44">
                        <button
                          onClick={() => handleEditWorkspace(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4 text-gray-400" />
                          <span>Настроить</span>
                        </button>
                        <button
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Удалить</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom section - только для админов */}
        {isAdmin && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Администрирование
            </div>
            <button
              onClick={() => router.push('/admin/users')}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors cursor-pointer"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Пользователи</span>
            </button>
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
            {getInitials()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{getFullName()}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
