'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Settings, MoreVertical, Pencil, Trash2, Sparkles } from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { Workspace } from '@/types';

interface SidebarProps {
  selectedWorkspace: string;
  onWorkspaceChange: (id: string) => void;
}

export function Sidebar({ selectedWorkspace, onWorkspaceChange }: SidebarProps) {
  const router = useRouter();
  const { workspaces, fetchWorkspaces, createWorkspace, deleteWorkspace } =
    useWorkspaceStore();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
    <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-gray-200/50 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-soft">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Stankoff</h1>
            <p className="text-xs text-gray-500">Портал управления</p>
          </div>
        </div>
      </div>

      <nav className="p-4 flex-1 overflow-y-auto">
        {/* Create button */}
        <div className="mb-6">
          <button
            onClick={handleCreateWorkspace}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-soft hover:shadow-soft-lg disabled:opacity-50 active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">
              {creating ? 'Создаём...' : 'Создать рабочее место'}
            </span>
          </button>
        </div>

        {/* Workspaces */}
        <div className="space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Рабочие места
          </div>

          {workspaces.length === 0 && (
            <div className="px-3 py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
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
              className={`group relative flex items-center rounded-xl transition-all duration-200 ${
                selectedWorkspace === workspace.id
                  ? 'bg-gradient-to-r from-primary-50 to-primary-100/50 shadow-sm'
                  : 'hover:bg-gray-50'
              }`}
            >
              <button
                onClick={() => onWorkspaceChange(workspace.id)}
                className={`flex-1 flex items-center gap-3 px-3 py-2.5 ${
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

              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === workspace.id ? null : workspace.id);
                  }}
                  className="p-1.5 mr-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {menuOpen === workspace.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(null)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white/90 backdrop-blur-xl border border-gray-200/50 rounded-xl shadow-soft-lg py-1.5 w-44 animate-scale-in">
                      <button
                        onClick={() => handleEditWorkspace(workspace.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-gray-400" />
                        <span>Настроить</span>
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspace(workspace.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Удалить</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom section */}
        <div className="mt-6 pt-6 border-t border-gray-200/50">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Общее
          </div>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-all duration-200">
            <Users className="w-5 h-5" />
            <span className="font-medium">Сотрудники</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-all duration-200">
            <Settings className="w-5 h-5" />
            <span className="font-medium">Настройки</span>
          </button>
        </div>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-200/50">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-sm font-medium shadow-soft">
            АД
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">Администратор</p>
            <p className="text-xs text-gray-500 truncate">admin@stankoff.ru</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
