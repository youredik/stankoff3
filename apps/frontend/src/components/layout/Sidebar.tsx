'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Settings, MoreVertical, Pencil, Trash2 } from 'lucide-react';
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
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <nav className="p-4 flex-1">
        <div className="mb-6">
          <button
            onClick={handleCreateWorkspace}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">
              {creating ? 'Создаём...' : 'Создать рабочее место'}
            </span>
          </button>
        </div>

        <div className="space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
            Рабочие места
          </div>

          {workspaces.length === 0 && (
            <p className="px-3 py-4 text-sm text-gray-400 text-center">
              Нет рабочих мест
            </p>
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
                className={`flex-1 flex items-center gap-3 px-3 py-2 ${
                  selectedWorkspace === workspace.id
                    ? 'text-primary-700'
                    : 'text-gray-700'
                }`}
              >
                <span className="text-xl">{workspace.icon}</span>
                <span className="font-medium truncate">{workspace.name}</span>
              </button>

              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === workspace.id ? null : workspace.id);
                  }}
                  className="p-1.5 mr-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {menuOpen === workspace.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(null)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                      <button
                        onClick={() => handleEditWorkspace(workspace.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Настроить</span>
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspace(workspace.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
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

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
            Общее
          </div>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
            <Users className="w-5 h-5" />
            <span className="font-medium">Сотрудники</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
            <span className="font-medium">Настройки</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
