'use client';

import { useState } from 'react';
import { X, Search, User, Tag, Calendar, ChevronDown, Hash, Type } from 'lucide-react';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { Field, FieldType, FieldOption, User as UserType } from '@/types';

export interface FilterState {
  search: string;
  assigneeIds: string[];
  priorities: string[];
  dateFrom: string;
  dateTo: string;
  customFilters: Record<string, any>;
}

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClose: () => void;
}

const PRIORITY_OPTIONS: FieldOption[] = [
  { id: 'critical', label: 'Критический', color: '#DC2626' },
  { id: 'high', label: 'Высокий', color: '#EF4444' },
  { id: 'medium', label: 'Средний', color: '#F59E0B' },
  { id: 'low', label: 'Низкий', color: '#10B981' },
];

const BUILT_IN_FIELD_IDS = ['title', 'assignee', 'priority'];
const SKIP_FILTER_TYPES: FieldType[] = ['status', 'file', 'relation'];

function getFieldIcon(type: FieldType) {
  switch (type) {
    case 'text':
    case 'textarea':
      return Type;
    case 'number':
      return Hash;
    case 'date':
      return Calendar;
    case 'select':
      return Tag;
    case 'user':
      return User;
    default:
      return Tag;
  }
}

export function isFilterActive(value: any): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'object') {
    return Object.values(value).some((v) => v != null && v !== '');
  }
  return false;
}

export function FilterPanel({
  filters,
  onFiltersChange,
  onClose,
}: FilterPanelProps) {
  const { users } = useEntityStore();
  const { currentWorkspace } = useWorkspaceStore();
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'common',
  ]);

  // Collect filterable fields grouped by workspace section
  const workspaceSections = (currentWorkspace?.sections || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      ...section,
      filterableFields: section.fields.filter(
        (f) =>
          !BUILT_IN_FIELD_IDS.includes(f.id) &&
          !SKIP_FILTER_TYPES.includes(f.type),
      ),
    }))
    .filter((section) => section.filterableFields.length > 0);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (
    key: 'assigneeIds' | 'priorities',
    value: string,
  ) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated);
  };

  const setCustomFilter = (fieldId: string, value: any) => {
    updateFilter('customFilters', {
      ...filters.customFilters,
      [fieldId]: value,
    });
  };

  const toggleCustomMultiSelect = (fieldId: string, optionId: string) => {
    const current: string[] = filters.customFilters[fieldId] || [];
    const updated = current.includes(optionId)
      ? current.filter((v) => v !== optionId)
      : [...current, optionId];
    setCustomFilter(fieldId, updated);
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
    Object.values(filters.customFilters).some((v) => isFilterActive(v));

  // Count active custom filters for a specific field
  const fieldFilterCount = (fieldId: string): number => {
    const val = filters.customFilters[fieldId];
    return isFilterActive(val) ? 1 : 0;
  };

  const inputClass =
    'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

  const renderSelectFilter = (field: Field) => {
    if (!field.options) return null;
    return (
      <div className="mt-2 space-y-1">
        {field.options.map((option) => (
          <label
            key={option.id}
            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={
                filters.customFilters[field.id]?.includes(option.id) || false
              }
              onChange={() => toggleCustomMultiSelect(field.id, option.id)}
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
    );
  };

  const renderUserFilter = (field: Field) => (
    <div className="mt-2 space-y-1">
      {users.map((user) => (
        <label
          key={user.id}
          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={
              filters.customFilters[field.id]?.includes(user.id) || false
            }
            onChange={() => toggleCustomMultiSelect(field.id, user.id)}
            className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
          />
          <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs">{user.firstName[0]}</span>
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {user.firstName} {user.lastName}
          </span>
        </label>
      ))}
    </div>
  );

  const renderTextFilter = (field: Field) => (
    <div className="mt-2">
      <input
        type="text"
        value={filters.customFilters[field.id] || ''}
        onChange={(e) => setCustomFilter(field.id, e.target.value)}
        placeholder={`Поиск по "${field.name}"...`}
        className={inputClass}
      />
    </div>
  );

  const renderNumberFilter = (field: Field) => {
    const range = filters.customFilters[field.id] || {};
    return (
      <div className="mt-2 flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Мин
          </label>
          <input
            type="number"
            value={range.min ?? ''}
            onChange={(e) =>
              setCustomFilter(field.id, {
                ...range,
                min: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder="Мин"
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Макс
          </label>
          <input
            type="number"
            value={range.max ?? ''}
            onChange={(e) =>
              setCustomFilter(field.id, {
                ...range,
                max: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder="Макс"
            className={inputClass}
          />
        </div>
      </div>
    );
  };

  const renderDateFilter = (field: Field) => {
    const range = filters.customFilters[field.id] || {};
    return (
      <div className="mt-2 space-y-2">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">От</label>
          <input
            type="date"
            value={range.from || ''}
            onChange={(e) =>
              setCustomFilter(field.id, {
                ...range,
                from: e.target.value || undefined,
              })
            }
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">До</label>
          <input
            type="date"
            value={range.to || ''}
            onChange={(e) =>
              setCustomFilter(field.id, {
                ...range,
                to: e.target.value || undefined,
              })
            }
            className={inputClass}
          />
        </div>
      </div>
    );
  };

  const renderFieldFilter = (field: Field) => {
    switch (field.type) {
      case 'select':
        return renderSelectFilter(field);
      case 'user':
        return renderUserFilter(field);
      case 'text':
      case 'textarea':
        return renderTextFilter(field);
      case 'number':
        return renderNumberFilter(field);
      case 'date':
        return renderDateFilter(field);
      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Фильтры
          </h3>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {/* ====== Секция «Общие» ====== */}
          <div className="mb-3">
            <button
              onClick={() => toggleSection('common')}
              className="flex items-center justify-between w-full text-left cursor-pointer py-1"
            >
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Общие
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                  expandedSections.includes('common') ? 'rotate-180' : ''
                }`}
              />
            </button>

            {expandedSections.includes('common') && (
              <div className="mt-2 space-y-4">
                {/* Search */}
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    <Search className="w-4 h-4" />
                    <span>Поиск</span>
                  </div>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                    placeholder="Поиск по названию..."
                    className={inputClass}
                  />
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
                            onChange={() =>
                              toggleArrayFilter('assigneeIds', user.id)
                            }
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
                            onChange={() =>
                              toggleArrayFilter('priorities', option.id)
                            }
                            className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                          />
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: option.color }}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {option.label}
                          </span>
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
                        <label className="text-xs text-gray-500 dark:text-gray-400">
                          От
                        </label>
                        <input
                          type="date"
                          value={filters.dateFrom}
                          onChange={(e) =>
                            updateFilter('dateFrom', e.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">
                          До
                        </label>
                        <input
                          type="date"
                          value={filters.dateTo}
                          onChange={(e) =>
                            updateFilter('dateTo', e.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ====== Секции из workspace ====== */}
          {workspaceSections.map((section) => (
            <div key={section.id} className="mb-3">
              <button
                onClick={() => toggleSection(`ws-${section.id}`)}
                className="flex items-center justify-between w-full text-left cursor-pointer py-1"
              >
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {section.name}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                    expandedSections.includes(`ws-${section.id}`)
                      ? 'rotate-180'
                      : ''
                  }`}
                />
              </button>

              {expandedSections.includes(`ws-${section.id}`) && (
                <div className="mt-2 space-y-4">
                  {section.filterableFields.map((field) => {
                    const Icon = getFieldIcon(field.type);
                    const activeCount = fieldFilterCount(field.id);

                    return (
                      <div key={field.id}>
                        <button
                          onClick={() => toggleSection(`field-${field.id}`)}
                          className="flex items-center justify-between w-full text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <Icon className="w-4 h-4" />
                            <span>{field.name}</span>
                            {activeCount > 0 && (
                              <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                                {activeCount}
                              </span>
                            )}
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                              expandedSections.includes(`field-${field.id}`)
                                ? 'rotate-180'
                                : ''
                            }`}
                          />
                        </button>
                        {expandedSections.includes(`field-${field.id}`) &&
                          renderFieldFilter(field)}
                      </div>
                    );
                  })}
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
  filters: FilterState,
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
      if (
        !entity.assigneeId ||
        !filters.assigneeIds.includes(entity.assigneeId)
      ) {
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

    // Custom filters — type inferred from value shape
    for (const [fieldId, filterValue] of Object.entries(
      filters.customFilters,
    )) {
      if (!isFilterActive(filterValue)) continue;

      const entityValue = entity.data?.[fieldId];

      if (Array.isArray(filterValue)) {
        // select / user: multi-select match
        if (!entityValue || !filterValue.includes(entityValue)) {
          return false;
        }
      } else if (typeof filterValue === 'string') {
        // text / textarea: substring search
        const strValue = entityValue?.toString() || '';
        if (!strValue.toLowerCase().includes(filterValue.toLowerCase())) {
          return false;
        }
      } else if (typeof filterValue === 'object' && filterValue !== null) {
        if ('min' in filterValue || 'max' in filterValue) {
          // number range
          const num = Number(entityValue);
          if (entityValue == null || entityValue === '' || isNaN(num)) {
            return false;
          }
          if (filterValue.min != null && num < filterValue.min) return false;
          if (filterValue.max != null && num > filterValue.max) return false;
        } else if ('from' in filterValue || 'to' in filterValue) {
          // date range
          if (!entityValue) return false;
          const d = new Date(entityValue);
          if (filterValue.from) {
            if (d < new Date(filterValue.from)) return false;
          }
          if (filterValue.to) {
            const to = new Date(filterValue.to);
            to.setHours(23, 59, 59, 999);
            if (d > to) return false;
          }
        }
      }
    }

    return true;
  });
}
