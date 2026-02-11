'use client';

import { useMemo } from 'react';
import { Check, Minus } from 'lucide-react';
import type { RoleScope, PermissionMeta } from '@/types';

interface PermissionTreeProps {
  permissions: PermissionMeta[];
  selected: string[];
  onChange: (permissions: string[]) => void;
  scope: RoleScope;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  entities: 'Заявки',
  comments: 'Комментарии',
  settings: 'Настройки',
  bpmn: 'Бизнес-процессы',
  analytics: 'Аналитика и экспорт',
  section: 'Разделы',
  administration: 'Администрирование',
};

export function PermissionTree({ permissions, selected, onChange, scope, disabled }: PermissionTreeProps) {
  const filtered = useMemo(
    () => permissions.filter((p) => p.scope === scope),
    [permissions, scope],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionMeta[]>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Wildcard * значит "все permissions"
  const hasWildcard = selectedSet.has('*') ||
    selectedSet.has(`${scope}:*`) ||
    selectedSet.has('workspace:*') ||
    selectedSet.has('section:*') ||
    selectedSet.has('global:*');

  const togglePermission = (key: string) => {
    if (disabled) return;
    if (selectedSet.has(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const toggleCategory = (categoryPerms: PermissionMeta[]) => {
    if (disabled) return;
    const categoryKeys = categoryPerms.map((p) => p.key);
    const allSelected = categoryKeys.every((k) => selectedSet.has(k));

    if (allSelected) {
      onChange(selected.filter((k) => !categoryKeys.includes(k)));
    } else {
      const newSet = new Set(selected);
      categoryKeys.forEach((k) => newSet.add(k));
      onChange(Array.from(newSet));
    }
  };

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
        Нет permissions для scope &laquo;{scope}&raquo;
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Wildcard */}
      <label className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
        hasWildcard
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-500/30'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={hasWildcard}
          onChange={() => {
            if (disabled) return;
            if (hasWildcard) {
              // Убираем wildcard
              const wildcards = ['*', `${scope}:*`, 'workspace:*', 'section:*', 'global:*'];
              onChange(selected.filter((k) => !wildcards.includes(k)));
            } else {
              // Добавляем wildcard для scope
              const scopeWildcard = scope === 'global' ? '*' : `${scope}:*`;
              onChange([...selected.filter((k) => !filtered.some((p) => p.key === k)), scopeWildcard]);
            }
          }}
          disabled={disabled}
          className="sr-only"
        />
        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
          hasWildcard
            ? 'bg-primary-500 text-white'
            : 'border-2 border-gray-300 dark:border-gray-600'
        }`}>
          {hasWildcard && <Check className="w-3.5 h-3.5" />}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Все права ({scope === 'global' ? 'суперадмин' : scope === 'section' ? 'раздела' : 'workspace'})
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Предоставляет полный доступ ко всем возможностям
          </div>
        </div>
      </label>

      {/* Categories */}
      {grouped.map(([category, perms]) => {
        const categoryKeys = perms.map((p) => p.key);
        const selectedCount = categoryKeys.filter((k) => selectedSet.has(k) || hasWildcard).length;
        const allSelected = selectedCount === categoryKeys.length;
        const someSelected = selectedCount > 0 && !allSelected;

        return (
          <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => !hasWildcard && toggleCategory(perms)}
              disabled={disabled || hasWildcard}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                disabled || hasWildcard ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                allSelected || hasWildcard
                  ? 'bg-primary-500 text-white'
                  : someSelected
                    ? 'bg-primary-500 text-white'
                    : 'border-2 border-gray-300 dark:border-gray-600'
              }`}>
                {(allSelected || hasWildcard) && <Check className="w-3.5 h-3.5" />}
                {someSelected && !hasWildcard && <Minus className="w-3.5 h-3.5" />}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {CATEGORY_LABELS[category] || category}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {selectedCount}/{categoryKeys.length}
              </span>
            </button>

            {/* Permissions */}
            <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {perms.map((perm) => {
                const isChecked = selectedSet.has(perm.key) || hasWildcard;

                return (
                  <label
                    key={perm.key}
                    className={`flex items-start gap-3 px-3 py-2 ${
                      disabled || hasWildcard ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => !hasWildcard && togglePermission(perm.key)}
                      disabled={disabled || hasWildcard}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isChecked
                        ? 'bg-primary-500 text-white'
                        : 'border-2 border-gray-300 dark:border-gray-600'
                    }`}>
                      {isChecked && <Check className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 dark:text-gray-200">{perm.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{perm.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
