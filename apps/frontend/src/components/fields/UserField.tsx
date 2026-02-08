'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { UserFieldConfig } from '@/types';
import type { FieldRenderer } from './types';
import { usePresenceStore } from '@/store/usePresenceStore';

function UserAvatar({ firstName, lastName, size = 'sm', showOnline }: {
  firstName: string; lastName: string; size?: 'sm' | 'xs'; showOnline?: boolean;
}) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-5 h-5 text-[9px]';
  return (
    <div className="relative inline-flex flex-shrink-0">
      <div className={`${sizeClass} bg-primary-600 rounded-full flex items-center justify-center`}>
        <span className="text-white font-medium">{firstName[0]}{lastName[0]}</span>
      </div>
      {showOnline && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
      )}
    </div>
  );
}

// Фильтрация пользователей по отделу
function useFilteredUsers(users: any[], config?: UserFieldConfig) {
  return useMemo(() => {
    if (!config?.departmentFilter) return users;
    return users.filter((u) => u.department === config.departmentFilter);
  }, [users, config?.departmentFilter]);
}

function UserRenderer({ field, value, users, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const config = field.config as UserFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const showOnline = config?.showOnlineStatus ?? false;
  const filteredUsers = useFilteredUsers(users, config);
  const onlineUserIds = usePresenceStore((s) => s.onlineUserIds);

  const isUserOnline = (userId: string) => showOnline && onlineUserIds.has(userId);

  if (!canEdit) {
    if (isMulti) {
      const ids: string[] = Array.isArray(value) ? value : value ? [value] : [];
      if (ids.length === 0) return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
      return (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => {
            const u = users.find((u) => u.id === id);
            if (!u) return null;
            return (
              <div key={id} className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                <UserAvatar firstName={u.firstName} lastName={u.lastName} size="xs" showOnline={isUserOnline(id)} />
                <span className="text-xs text-gray-700 dark:text-gray-300">{u.firstName} {u.lastName}</span>
              </div>
            );
          })}
        </div>
      );
    }

    const selectedUser = users.find((u) => u.id === value);
    return selectedUser ? (
      <div className="flex items-center gap-2">
        <UserAvatar firstName={selectedUser.firstName} lastName={selectedUser.lastName} showOnline={isUserOnline(selectedUser.id)} />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {selectedUser.firstName} {selectedUser.lastName}
        </span>
      </div>
    ) : (
      <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
    );
  }

  // Multi-select edit mode
  if (isMulti) {
    const selectedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <div className="space-y-1">
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {selectedIds.map((id) => {
              const u = users.find((u) => u.id === id);
              if (!u) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-full text-xs">
                  {u.firstName} {u.lastName}
                  <button onClick={() => onUpdate(selectedIds.filter((i) => i !== id))} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value && !selectedIds.includes(e.target.value)) {
              onUpdate([...selectedIds, e.target.value]);
            }
          }}
          className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Добавить пользователя...</option>
          {filteredUsers.filter((u) => !selectedIds.includes(u.id)).map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Single select
  return (
    <select
      value={value || ''}
      onChange={(e) => onUpdate(e.target.value || null)}
      className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
    >
      <option value="">Не выбрано</option>
      {filteredUsers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.firstName} {u.lastName}
        </option>
      ))}
    </select>
  );
}

function UserForm({ field, value, users, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as UserFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const filteredUsers = useFilteredUsers(users, config);

  if (isMulti) {
    const selectedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <div className="space-y-1">
        {filteredUsers.map((u) => (
          <label key={u.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.includes(u.id)}
              onChange={() => {
                const newIds = selectedIds.includes(u.id)
                  ? selectedIds.filter((id) => id !== u.id)
                  : [...selectedIds, u.id];
                onChange(newIds);
              }}
              className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
            />
            <UserAvatar firstName={u.firstName} lastName={u.lastName} size="xs" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{u.firstName} {u.lastName}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <option value="">Не выбрано</option>
      {filteredUsers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.firstName} {u.lastName}
        </option>
      ))}
    </select>
  );
}

function UserFilter({ field, filterValue, users, toggleMultiSelect }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  return (
    <div className="mt-2 space-y-1">
      {users.map((user) => (
        <label
          key={user.id}
          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={filterValue?.includes(user.id) || false}
            onChange={() => toggleMultiSelect(user.id)}
            className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
          />
          <UserAvatar firstName={user.firstName} lastName={user.lastName} size="xs" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {user.firstName} {user.lastName}
          </span>
        </label>
      ))}
    </div>
  );
}

export const userFieldRenderer: FieldRenderer = {
  Renderer: UserRenderer,
  Form: UserForm,
  Filter: UserFilter,
};
