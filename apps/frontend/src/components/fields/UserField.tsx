'use client';

import { useMemo, useCallback } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { UserFieldConfig, User } from '@/types';
import type { FieldRenderer } from './types';
import { usePresenceStore } from '@/store/usePresenceStore';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useFilterableList } from '@/hooks/useFilterableList';
import SearchableSelect from '@/components/ui/SearchableSelect';

// Фильтрация пользователей по отделу
function useFilteredUsers(users: any[], config?: UserFieldConfig) {
  return useMemo(() => {
    if (!config?.departmentFilter) return users;
    return users.filter((u) => u.department === config.departmentFilter);
  }, [users, config?.departmentFilter]);
}

const getUserSearchText = (u: User) => `${u.firstName} ${u.lastName} ${u.email || ''}`;

const renderUserOption = (u: User) => (
  <span className="flex items-center gap-2">
    <UserAvatar firstName={u.firstName} lastName={u.lastName} size="xs" />
    <span>{u.firstName} {u.lastName}</span>
  </span>
);

const renderUserSelected = (u: User) => (
  <span className="flex items-center gap-2 truncate">
    <UserAvatar firstName={u.firstName} lastName={u.lastName} size="xs" />
    <span className="truncate">{u.firstName} {u.lastName}</span>
  </span>
);

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

  if (isMulti) {
    const selectedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <SearchableSelect
        options={filteredUsers}
        value={selectedIds}
        onChange={(v) => onUpdate(v)}
        multi
        getSearchText={getUserSearchText}
        renderOption={renderUserOption}
        renderSelectedMultiTag={(u, onRemove) => (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-full text-xs">
            <UserAvatar firstName={u.firstName} lastName={u.lastName} size="xs" />
            {u.firstName} {u.lastName}
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        placeholder="Добавить пользователя..."
        showEmptyOption={false}
      />
    );
  }

  return (
    <SearchableSelect
      options={filteredUsers}
      value={value || null}
      onChange={(v) => onUpdate(v)}
      getSearchText={getUserSearchText}
      renderOption={renderUserOption}
      renderSelectedSingle={renderUserSelected}
      emptyLabel="Не выбрано"
      placeholder="Не выбрано"
    />
  );
}

function UserForm({ field, value, users, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as UserFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const filteredUsers = useFilteredUsers(users, config);

  if (isMulti) {
    const selectedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <SearchableSelect
        options={filteredUsers}
        value={selectedIds}
        onChange={(v) => onChange(v)}
        multi
        getSearchText={getUserSearchText}
        renderOption={renderUserOption}
        renderSelectedMultiTag={(u, onRemove) => (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-full text-xs">
            <UserAvatar firstName={u.firstName} lastName={u.lastName} size="xs" />
            {u.firstName} {u.lastName}
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        placeholder="Выберите пользователей..."
        showEmptyOption={false}
      />
    );
  }

  return (
    <SearchableSelect
      options={filteredUsers}
      value={value || null}
      onChange={(v) => onChange(v)}
      getSearchText={getUserSearchText}
      renderOption={renderUserOption}
      renderSelectedSingle={renderUserSelected}
      emptyLabel="Не выбрано"
      placeholder="Не выбрано"
    />
  );
}

function UserFilter({ field, filterValue, users, toggleMultiSelect, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  const facet = facetData as import('@/types').UserFacet | undefined;

  const countMap = useMemo(() => {
    if (!facet?.values) return new Map<string, number>();
    return new Map(facet.values.map((v) => [v.value, v.count]));
  }, [facet]);

  const selectedIds = useMemo(() => filterValue || [], [filterValue]);
  const getSearchText = useCallback((u: User) => `${u.firstName} ${u.lastName} ${u.email || ''}`, []);
  const getUserId = useCallback((u: User) => u.id, []);

  const list = useFilterableList({
    items: users,
    selectedIds,
    getSearchText,
    getId: getUserId,
  });

  const renderUser = (user: User, checked: boolean) => {
    const count = countMap.get(user.id);
    const isDisabled = !checked && facet && count === undefined;

    return (
      <label
        key={user.id}
        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
          isDisabled ? 'opacity-40 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleMultiSelect(user.id)}
          disabled={!!isDisabled}
          className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
        />
        <UserAvatar firstName={user.firstName} lastName={user.lastName} size="xs" />
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
          {user.firstName} {user.lastName}
        </span>
        {count != null && (
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
        )}
      </label>
    );
  };

  return (
    <div className="mt-2">
      {list.needsControls && (
        <input
          type="text"
          value={list.searchQuery}
          onChange={(e) => list.setSearchQuery(e.target.value)}
          placeholder="Поиск по имени..."
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
        />
      )}
      <div className="space-y-1">
        {list.selectedItems.map((u) => renderUser(u, true))}
        {list.selectedItems.length > 0 && list.unselectedItems.length > 0 && (
          <div className="border-t border-dashed border-gray-200 dark:border-gray-700 my-1" />
        )}
        {list.unselectedItems.map((u) => renderUser(u, false))}
        {list.needsControls && !list.searchQuery && (
          list.hasMore ? (
            <button
              onClick={list.toggleShowAll}
              className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer py-1 px-2"
            >
              <ChevronDown className="w-3 h-3" />
              <span>Ещё {list.hiddenCount}</span>
            </button>
          ) : list.showAll ? (
            <button
              onClick={list.toggleShowAll}
              className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer py-1 px-2"
            >
              <ChevronDown className="w-3 h-3 rotate-180" />
              <span>Свернуть</span>
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}

export const userFieldRenderer: FieldRenderer = {
  Renderer: UserRenderer,
  Form: UserForm,
  Filter: UserFilter,
};
