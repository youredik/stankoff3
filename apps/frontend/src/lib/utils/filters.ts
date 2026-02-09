import type { FilterState } from '@/components/kanban/FilterPanel';
import type { EntityFilters } from '@/lib/api/entities';

export function filtersToApi(filters: FilterState): EntityFilters {
  return {
    search: filters.search || undefined,
    assigneeId: filters.assigneeIds.length > 0 ? filters.assigneeIds : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  };
}
