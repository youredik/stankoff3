'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Shield } from 'lucide-react';
import { rbacApi } from '@/lib/api/rbac';
import { PermissionTree } from './PermissionTree';
import type { Role, RoleScope, PermissionMeta } from '@/types';

interface RoleEditorProps {
  role: Role | null; // null = создание новой роли
  onSave: () => void;
  onClose: () => void;
}

const SCOPE_LABELS: Record<RoleScope, string> = {
  global: 'Глобальная',
  section: 'Раздел',
  workspace: 'Рабочее пространство',
};

export function RoleEditor({ role, onSave, onClose }: RoleEditorProps) {
  const isEdit = !!role;

  const [name, setName] = useState(role?.name || '');
  const [slug, setSlug] = useState(role?.slug || '');
  const [description, setDescription] = useState(role?.description || '');
  const [scope, setScope] = useState<RoleScope>(role?.scope || 'workspace');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions || []);
  const [allPermissions, setAllPermissions] = useState<PermissionMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    rbacApi.getPermissionRegistry().then(setAllPermissions).catch(console.error);
  }, []);

  // Авто-генерация slug
  useEffect(() => {
    if (!isEdit && name) {
      const generated = name
        .toLowerCase()
        .replace(/[а-яё]/gi, (c) => {
          const map: Record<string, string> = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
            'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
            'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
          };
          return map[c.toLowerCase()] || c;
        })
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      setSlug(generated);
    }
  }, [name, isEdit]);

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) {
      setError('Название и slug обязательны');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await rbacApi.updateRole(role!.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          permissions,
        });
      } else {
        await rbacApi.createRole({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          scope,
          permissions,
        });
      }
      onSave();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сохранения';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? `Редактирование: ${role!.name}` : 'Новая роль'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Основные поля */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Название
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Менеджер проектов"
                disabled={role?.isSystem}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="project_manager"
                disabled={isEdit}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Описание
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание роли"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Область действия
            </label>
            <div className="flex gap-2">
              {(['global', 'section', 'workspace'] as RoleScope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => !isEdit && setScope(s)}
                  disabled={isEdit}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    scope === s
                      ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-500/50 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  } ${isEdit ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Permission tree */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Права доступа
            </label>
            <PermissionTree
              permissions={allPermissions}
              selected={permissions}
              onChange={setPermissions}
              scope={scope}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !slug.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
