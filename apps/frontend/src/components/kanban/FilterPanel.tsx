'use client';

import { X, Search, User, Tag, Calendar, Hash, Type, ToggleLeft, Link2, MapPin, Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useEntityStore } from '@/store/useEntityStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { fieldRegistry } from '@/components/fields';
import type { Field, FieldType, FieldOption, FacetResult } from '@/types';

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
  facets?: FacetResult | null;
}

const PRIORITY_OPTIONS: FieldOption[] = [
  { id: 'critical', label: 'Критический', color: '#DC2626' },
  { id: 'high', label: 'Высокий', color: '#EF4444' },
  { id: 'medium', label: 'Средний', color: '#F59E0B' },
  { id: 'low', label: 'Низкий', color: '#10B981' },
];

const BUILT_IN_FIELD_IDS = ['title', 'assignee', 'priority'];
const SKIP_FILTER_TYPES: FieldType[] = ['status', 'file', 'relation', 'geolocation'];

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
    case 'checkbox':
      return ToggleLeft;
    case 'url':
      return Link2;
    case 'geolocation':
      return MapPin;
    case 'client':
      return Users;
    default:
      return Tag;
  }
}

export function isFilterActive(value: any): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return true;
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
  facets,
}: FilterPanelProps) {
  const { users } = useEntityStore();
  const { currentWorkspace } = useWorkspaceStore();

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

  // Все поля из всех секций (для cascadeFrom в фильтрах)
  const allWorkspaceFields = (currentWorkspace?.sections || []).flatMap((s) => s.fields);

  // Счётчики для built-in фильтров
  const assigneeCountMap = new Map<string, number>(
    facets?.builtIn?.assignee?.map((a) => [a.value, a.count]) || [],
  );
  const priorityCountMap = new Map<string, number>(
    facets?.builtIn?.priority?.map((p) => [p.value, p.count]) || [],
  );

  const renderFieldFilter = (field: Field) => {
    const renderer = fieldRegistry[field.type];
    if (!renderer?.Filter) return null;
    const FilterComp = renderer.Filter;
    return (
      <FilterComp
        field={field}
        filterValue={filters.customFilters[field.id]}
        users={users}
        onChange={(value: any) => setCustomFilter(field.id, value)}
        toggleMultiSelect={(optionId: string) => toggleCustomMultiSelect(field.id, optionId)}
        inputClass={inputClass}
        allFields={allWorkspaceFields}
        allFilterValues={filters.customFilters}
        facetData={facets?.custom?.[field.id]}
      />
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div data-testid="filter-panel" className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Фильтры
          </h3>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                data-testid="filter-reset-button"
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
            <div className="py-1">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Общие
              </span>
            </div>

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
                  data-testid="filter-search-input"
                  className={inputClass}
                />
              </div>

              {/* Assignee */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  <User className="w-4 h-4" />
                  <span>Исполнитель</span>
                  {filters.assigneeIds.length > 0 && (
                    <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                      {filters.assigneeIds.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {users.map((user) => {
                    const count = assigneeCountMap.get(user.id);
                    const isDisabled = facets && count === undefined;
                    return (
                      <label
                        key={user.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          isDisabled
                            ? 'opacity-40 cursor-default'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={filters.assigneeIds.includes(user.id)}
                          onChange={() =>
                            toggleArrayFilter('assigneeIds', user.id)
                          }
                          disabled={!!isDisabled}
                          className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                        />
                        <UserAvatar
                          firstName={user.firstName}
                          lastName={user.lastName}
                          userId={user.id}
                          size="sm"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                          {user.firstName} {user.lastName}
                        </span>
                        {count != null && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Priority */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  <Tag className="w-4 h-4" />
                  <span>Приоритет</span>
                  {filters.priorities.length > 0 && (
                    <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                      {filters.priorities.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {PRIORITY_OPTIONS.map((option) => {
                    const count = priorityCountMap.get(option.id);
                    const isDisabled = facets && count === undefined;
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          isDisabled
                            ? 'opacity-40 cursor-default'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={filters.priorities.includes(option.id)}
                          onChange={() =>
                            toggleArrayFilter('priorities', option.id)
                          }
                          disabled={!!isDisabled}
                          className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                        />
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: option.color }}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                          {option.label}
                        </span>
                        {count != null && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Date */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  <Calendar className="w-4 h-4" />
                  <span>Дата создания</span>
                </div>
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
              </div>
            </div>
          </div>

          {/* ====== Секции из workspace ====== */}
          {workspaceSections.map((section) => (
            <div key={section.id} className="mb-3" data-testid={`filter-section-${section.id}`}>
              <div className="py-1">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {section.name}
                </span>
              </div>

              <div className="mt-2 space-y-4">
                {section.filterableFields.map((field) => {
                  const Icon = getFieldIcon(field.type);
                  const activeCount = fieldFilterCount(field.id);

                  return (
                    <div key={field.id} data-testid={`filter-field-${field.id}`}>
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <Icon className="w-4 h-4" />
                        <span>{field.name}</span>
                        {activeCount > 0 && (
                          <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded">
                            {activeCount}
                          </span>
                        )}
                      </div>
                      {renderFieldFilter(field)}
                    </div>
                  );
                })}
              </div>
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

      if (typeof filterValue === 'boolean') {
        // checkbox: exact match
        if (Boolean(entityValue) !== filterValue) return false;
      } else if (Array.isArray(filterValue)) {
        // select / user: multi-select match (also handles multi-select values)
        if (Array.isArray(entityValue)) {
          if (!filterValue.some((v: string) => entityValue.includes(v))) return false;
        } else if (!entityValue || !filterValue.includes(entityValue)) {
          return false;
        }
      } else if (typeof filterValue === 'string') {
        // text / textarea / url / client: substring search
        let searchStr = '';
        if (typeof entityValue === 'object' && entityValue !== null) {
          // client field: search across name/phone/email
          searchStr = Object.values(entityValue).filter(Boolean).join(' ');
        } else {
          searchStr = entityValue?.toString() || '';
        }
        if (!searchStr.toLowerCase().includes(filterValue.toLowerCase())) {
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
