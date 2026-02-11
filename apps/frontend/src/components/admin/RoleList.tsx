'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, Shield, Loader2, Lock } from 'lucide-react';
import { rbacApi } from '@/lib/api/rbac';
import { RoleEditor } from './RoleEditor';
import type { Role, RoleScope } from '@/types';

const SCOPE_LABELS: Record<RoleScope, string> = {
  global: 'Глобальная',
  section: 'Раздел',
  workspace: 'Workspace',
};

const SCOPE_COLORS: Record<RoleScope, string> = {
  global: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300',
  section: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
  workspace: 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300',
};

export function RoleList() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<RoleScope | 'all'>('all');
  const [editingRole, setEditingRole] = useState<Role | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadRoles = async () => {
    try {
      const data = await rbacApi.getRoles();
      setRoles(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const filteredRoles = useMemo(() => {
    let filtered = roles;
    if (scopeFilter !== 'all') {
      filtered = filtered.filter((r) => r.scope === scopeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [roles, scopeFilter, search]);

  const handleDelete = async (role: Role) => {
    if (role.isSystem) return;
    if (!window.confirm(`Удалить роль "${role.name}"? Пользователи с этой ролью потеряют связанные права.`)) return;
    setDeleting(role.id);
    try {
      await rbacApi.deleteRole(role.id);
      setRoles(roles.filter((r) => r.id !== role.id));
    } catch {
      alert('Не удалось удалить роль');
    } finally {
      setDeleting(null);
    }
  };

  const handleSave = () => {
    setEditingRole(undefined);
    loadRoles();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
      {/* Editor modal */}
      {editingRole !== undefined && (
        <RoleEditor
          role={editingRole}
          onSave={handleSave}
          onClose={() => setEditingRole(undefined)}
        />
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск ролей..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Scope filter */}
          <div className="flex gap-1">
            {(['all', 'global', 'section', 'workspace'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScopeFilter(s)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  scopeFilter === s
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {s === 'all' ? 'Все' : SCOPE_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Create */}
          <button
            onClick={() => setEditingRole(null)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Новая роль</span>
          </button>
        </div>

        {/* Roles table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Роль</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Область</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Permissions</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Тип</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRoles.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-sm text-gray-400">
                    {search ? 'Нет ролей по запросу' : 'Нет ролей'}
                  </td>
                </tr>
              )}
              {filteredRoles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{role.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{role.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${SCOPE_COLORS[role.scope]}`}>
                      {SCOPE_LABELS[role.scope]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {role.permissions.includes('*') || role.permissions.some((p) => p.endsWith(':*'))
                        ? 'Все'
                        : role.permissions.length}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {role.isSystem ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Lock className="w-3 h-3" />
                        Системная
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Кастомная</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingRole(role)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        title="Редактировать"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!role.isSystem && (
                        <button
                          onClick={() => handleDelete(role)}
                          disabled={deleting === role.id}
                          className="p-1.5 text-gray-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 rounded transition-colors disabled:opacity-50"
                          title="Удалить"
                        >
                          {deleting === role.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}
