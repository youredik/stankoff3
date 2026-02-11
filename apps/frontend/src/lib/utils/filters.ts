import { isFilterActive, type FilterState } from '@/components/kanban/FilterPanel';
import type { EntityFilters } from '@/lib/api/entities';

export function filtersToApi(filters: FilterState): EntityFilters {
  // Собираем активные кастомные фильтры
  const activeCustomFilters: Record<string, any> = {};
  for (const [key, value] of Object.entries(filters.customFilters)) {
    if (isFilterActive(value)) {
      activeCustomFilters[key] = value;
    }
  }

  return {
    search: filters.search || undefined,
    assigneeId: filters.assigneeIds.length > 0 ? filters.assigneeIds : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    customFilters: Object.keys(activeCustomFilters).length > 0 ? activeCustomFilters : undefined,
  };
}
