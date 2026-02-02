'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, MoreVertical, Pencil, Trash2, Sparkles, LogOut, Eye, Copy, Archive, Download, Upload, ArchiveRestore, X } from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { workspacesApi } from '@/lib/api/workspaces';
import { ImportModal } from '@/components/workspace/ImportModal';
import type { Workspace } from '@/types';

interface SidebarProps {
  selectedWorkspace: string;
  onWorkspaceChange: (id: string) => void;
}

const ROLE_CONFIG = {
  admin: { label: 'Админ', bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  editor: { label: 'Редактор', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  viewer: { label: 'Просмотр', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', icon: true },
} as const;

export function Sidebar({ selectedWorkspace, onWorkspaceChange }: SidebarProps) {
  const router = useRouter();
  const { workspaces, fetchWorkspaces, createWorkspace, deleteWorkspace, duplicateWorkspace, archiveWorkspace, getRoleForWorkspace } =
    useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importWorkspaceId, setImportWorkspaceId] = useState<string | null>(null);

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

  const handleDuplicateWorkspace = async (workspace: Workspace) => {
    setMenuOpen(null);
    const newName = `${workspace.name} (копия)`;
    const duplicated = await duplicateWorkspace(workspace.id, newName);
    onWorkspaceChange(duplicated.id);
  };

  const handleArchiveWorkspace = async (workspace: Workspace) => {
    setMenuOpen(null);
    const newState = !workspace.isArchived;
    await archiveWorkspace(workspace.id, newState);
  };

  const handleExportJson = (id: string) => {
    setMenuOpen(null);
    window.open(workspacesApi.exportJson(id), '_blank');
  };

  const handleExportCsv = (id: string) => {
    setMenuOpen(null);
    window.open(workspacesApi.exportCsv(id), '_blank');
  };

  const handleImport = (id: string) => {
    setMenuOpen(null);
    setImportWorkspaceId(id);
  };

  const { isOpen, close } = useSidebarStore();

  // Close sidebar on workspace change (mobile)
  const handleWorkspaceChange = (id: string) => {
    onWorkspaceChange(id);
    close();
  };

  return (
    <>
    {/* Import Modal */}
    {importWorkspaceId && (
      <ImportModal
        workspaceId={importWorkspaceId}
        onClose={() => setImportWorkspaceId(null)}
      />
    )}

    {/* Mobile overlay */}
    {isOpen && (
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={close}
      />
    )}

    <aside
      className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
        min-h-screen flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stankoff</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Портал управления</p>
            </div>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={close}
            aria-label="Закрыть меню"
            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
              <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <span className="text-2xl opacity-50">📭</span>
              </div>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Нет рабочих мест
              </p>
            </div>
          )}

          {workspaces.map((workspace) => {
            const role = getRoleForWorkspace(workspace.id);
            const roleConfig = role ? ROLE_CONFIG[role] : null;

            return (
            <div
              key={workspace.id}
              className={`group relative flex items-center rounded-lg transition-colors ${
                selectedWorkspace === workspace.id
                  ? 'bg-primary-50 dark:bg-primary-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <button
                onClick={() => handleWorkspaceChange(workspace.id)}
                className={`flex-1 flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                  selectedWorkspace === workspace.id
                    ? 'text-primary-700 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className={`text-xl ${workspace.isArchived ? 'opacity-50' : ''}`}>{workspace.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-medium truncate ${workspace.isArchived ? 'text-gray-400 dark:text-gray-500' : ''}`}>{workspace.name}</span>
                    {workspace.isArchived && (
                      <Archive className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                  {/* Бейдж роли */}
                  {roleConfig && role !== 'admin' && (
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${roleConfig.bg} ${roleConfig.text}`}>
                      {'icon' in roleConfig && roleConfig.icon && <Eye className="w-2.5 h-2.5" />}
                      {roleConfig.label}
                    </span>
                  )}
                </div>
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
                    aria-label="Меню рабочего места"
                    aria-expanded={menuOpen === workspace.id}
                    aria-haspopup="true"
                    className="p-1.5 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuOpen === workspace.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpen(null)}
                      />
                      <div role="menu" aria-label="Действия с рабочим местом" className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-soft-lg py-1 w-48">
                        <button
                          onClick={() => handleEditWorkspace(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span>Настроить</span>
                        </button>
                        <button
                          onClick={() => handleDuplicateWorkspace(workspace)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span>Дублировать</span>
                        </button>
                        <button
                          onClick={() => handleArchiveWorkspace(workspace)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          {workspace.isArchived ? (
                            <>
                              <ArchiveRestore className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                              <span>Разархивировать</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                              <span>Архивировать</span>
                            </>
                          )}
                        </button>
                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                        <button
                          onClick={() => handleExportJson(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span>Экспорт JSON</span>
                        </button>
                        <button
                          onClick={() => handleExportCsv(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span>Экспорт CSV</span>
                        </button>
                        <button
                          onClick={() => handleImport(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span>Импорт</span>
                        </button>
                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                        <button
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 transition-colors cursor-pointer"
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
          );
          })}
        </div>

        {/* Bottom section - только для админов */}
        {isAdmin && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
            <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Администрирование
            </div>
            <button
              onClick={() => router.push('/admin/users')}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Пользователи</span>
            </button>
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
            {getInitials()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{getFullName()}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Выйти из системы"
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
