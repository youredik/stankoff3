'use client';

import { useState, useEffect } from 'react';
import { X, Search, User, Tag, Calendar, ChevronDown } from 'lucide-react';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { Field, FieldOption, User as UserType } from '@/types';

export interface FilterState {
  search: string;
  assigneeIds: string[];
  priorities: string[];
  dateFrom: string;
  dateTo: string;
  customFilters: Record<string, string[]>;
}

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClose: () => void;
}

const PRIORITY_OPTIONS: FieldOption[] = [
  { id: 'high', label: 'Высокий', color: '#EF4444' },
  { id: 'medium', label: 'Средний', color: '#F59E0B' },
  { id: 'low', label: 'Низкий', color: '#10B981' },
];

export function FilterPanel({
  filters,
  onFiltersChange,
  onClose,
}: FilterPanelProps) {
  const { users } = useEntityStore();
  const { currentWorkspace } = useWorkspaceStore();
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'search',
    'assignee',
    'priority',
  ]);

  // Get select fields from workspace for custom filters
  const selectFields: Field[] = [];
  if (currentWorkspace?.sections) {
    for (const section of currentWorkspace.sections) {
      for (const field of section.fields) {
        if (field.type === 'select' && field.id !== 'priority') {
          selectFields.push(field);
        }
      }
    }
  }

  const toggleSection = (id: string) => {
    setExpandedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (
    key: 'assigneeIds' | 'priorities',
    value: string
  ) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated);
  };

  const toggleCustomFilter = (fieldId: string, value: string) => {
    const current = filters.customFilters[fieldId] || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter('customFilters', {
      ...filters.customFilters,
      [fieldId]: updated,
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      search: '',
      assigneeIds: [],
      priorities: [],
      dateFrom: '',
      dateTo: '',
      customFilters: {},
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.assigneeIds.length > 0 ||
    filters.priorities.length > 0 ||
    filters.dateFrom ||
    filters.dateTo ||
    Object.values(filters.customFilters).some((v) => v.length > 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Фильтры</h3>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer"
              >
                Сбросить
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Search */}
          <div>
            <button
              onClick={() => toggleSection('search')}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Search className="w-4 h-4" />
                <span>Поиск</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                  expandedSections.includes('search') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSections.includes('search') && (
              <div className="mt-2">
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  placeholder="Поиск по названию..."
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
          </div>

          {/* Assignee */}
          <div>
            <button
              onClick={() => toggleSection('assignee')}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <User className="w-4 h-4" />
                <span>Исполнитель</span>
                {filters.assigneeIds.length > 0 && (
                  <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                    {filters.assigneeIds.length}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                  expandedSections.includes('assignee') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSections.includes('assignee') && (
              <div className="mt-2 space-y-1">
                {users.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.assigneeIds.includes(user.id)}
                      onChange={() => toggleArrayFilter('assigneeIds', user.id)}
                      className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                    />
                    <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs">
                        {user.firstName[0]}
                      </span>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {user.firstName} {user.lastName}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <button
              onClick={() => toggleSection('priority')}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Tag className="w-4 h-4" />
                <span>Приоритет</span>
                {filters.priorities.length > 0 && (
                  <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                    {filters.priorities.length}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                  expandedSections.includes('priority') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSections.includes('priority') && (
              <div className="mt-2 space-y-1">
                {PRIORITY_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.priorities.includes(option.id)}
                      onChange={() => toggleArrayFilter('priorities', option.id)}
                      className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                    />
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <button
              onClick={() => toggleSection('date')}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Calendar className="w-4 h-4" />
                <span>Дата создания</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                  expandedSections.includes('date') ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSections.includes('date') && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">От</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">До</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter('dateTo', e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Custom select fields */}
          {selectFields.map((field) => (
            <div key={field.id}>
              <button
                onClick={() => toggleSection(field.id)}
                className="flex items-center justify-between w-full text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  <Tag className="w-4 h-4" />
                  <span>{field.name}</span>
                  {(filters.customFilters[field.id]?.length || 0) > 0 && (
                    <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                      {filters.customFilters[field.id]?.length}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                    expandedSections.includes(field.id) ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {expandedSections.includes(field.id) && field.options && (
                <div className="mt-2 space-y-1">
                  {field.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={
                          filters.customFilters[field.id]?.includes(option.id) ||
                          false
                        }
                        onChange={() =>
                          toggleCustomFilter(field.id, option.id)
                        }
                        className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                      />
                      {option.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: option.color }}
                        />
                      )}
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Helper to create initial empty filter state
export function createEmptyFilters(): FilterState {
  return {
    search: '',
    assigneeIds: [],
    priorities: [],
    dateFrom: '',
    dateTo: '',
    customFilters: {},
  };
}

// Helper to apply filters to entities
export function applyFilters(
  entities: any[],
  filters: FilterState
): any[] {
  return entities.filter((entity) => {
    // Search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const titleMatch = entity.title?.toLowerCase().includes(searchLower);
      const idMatch = entity.customId?.toLowerCase().includes(searchLower);
      if (!titleMatch && !idMatch) return false;
    }

    // Assignee
    if (filters.assigneeIds.length > 0) {
      if (!entity.assigneeId || !filters.assigneeIds.includes(entity.assigneeId)) {
        return false;
      }
    }

    // Priority
    if (filters.priorities.length > 0) {
      if (!entity.priority || !filters.priorities.includes(entity.priority)) {
        return false;
      }
    }

    // Date from
    if (filters.dateFrom) {
      const entityDate = new Date(entity.createdAt);
      const fromDate = new Date(filters.dateFrom);
      if (entityDate < fromDate) return false;
    }

    // Date to
    if (filters.dateTo) {
      const entityDate = new Date(entity.createdAt);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (entityDate > toDate) return false;
    }

    // Custom filters
    for (const [fieldId, values] of Object.entries(filters.customFilters)) {
      if (values.length > 0) {
        const entityValue = entity.data?.[fieldId];
        if (!entityValue || !values.includes(entityValue)) {
          return false;
        }
      }
    }

    return true;
  });
}
