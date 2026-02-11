'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { createEmptyFilters, isFilterActive, type FilterState } from '@/components/kanban/FilterPanel';

const STORAGE_KEY_PREFIX = 'workspace-filters:';

function loadFilters(workspaceId: string): FilterState {
  if (typeof window === 'undefined') return createEmptyFilters();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
    if (!raw) return createEmptyFilters();
    const parsed = JSON.parse(raw) as FilterState;
    if (
      typeof parsed.search !== 'string' ||
      !Array.isArray(parsed.assigneeIds) ||
      !Array.isArray(parsed.priorities)
    ) {
      return createEmptyFilters();
    }
    return parsed;
  } catch {
    return createEmptyFilters();
  }
}

function saveFilters(workspaceId: string, filters: FilterState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, JSON.stringify(filters));
  } catch {
    // localStorage full or unavailable
  }
}

// ==================== URL <-> FilterState ====================

function filtersToUrlParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.assigneeIds.length > 0) params.set('assignee', filters.assigneeIds.join(','));
  if (filters.priorities.length > 0) params.set('priority', filters.priorities.join(','));
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);

  for (const [fieldId, value] of Object.entries(filters.customFilters)) {
    if (!isFilterActive(value)) continue;

    if (typeof value === 'boolean') {
      params.set(`f.${fieldId}`, String(value));
    } else if (Array.isArray(value)) {
      params.set(`f.${fieldId}`, value.join(','));
    } else if (typeof value === 'string') {
      params.set(`f.${fieldId}`, value);
    } else if (typeof value === 'object' && value !== null) {
      if ('min' in value || 'max' in value) {
        if (value.min != null) params.set(`f.${fieldId}.min`, String(value.min));
        if (value.max != null) params.set(`f.${fieldId}.max`, String(value.max));
      } else if ('from' in value || 'to' in value) {
        if (value.from) params.set(`f.${fieldId}.from`, value.from);
        if (value.to) params.set(`f.${fieldId}.to`, value.to);
      }
    }
  }

  return params;
}

function urlParamsToFilters(params: URLSearchParams): FilterState | null {
  const filterKeys = ['search', 'assignee', 'priority', 'dateFrom', 'dateTo'];
  const hasFilterParams = filterKeys.some((k) => params.has(k)) ||
    Array.from(params.keys()).some((k) => k.startsWith('f.'));

  if (!hasFilterParams) return null;

  const customFilters: Record<string, any> = {};
  const rangeFields = new Map<string, Record<string, any>>();

  for (const [key, value] of params.entries()) {
    if (!key.startsWith('f.')) continue;

    const rest = key.slice(2);
    const dotIndex = rest.indexOf('.');

    if (dotIndex === -1) {
      if (value === 'true') {
        customFilters[rest] = true;
      } else if (value === 'false') {
        customFilters[rest] = false;
      } else if (value.includes(',')) {
        customFilters[rest] = value.split(',');
      } else {
        customFilters[rest] = value;
      }
    } else {
      const fieldId = rest.slice(0, dotIndex);
      const suffix = rest.slice(dotIndex + 1);
      if (!rangeFields.has(fieldId)) rangeFields.set(fieldId, {});
      const range = rangeFields.get(fieldId)!;
      if (suffix === 'min' || suffix === 'max') {
        range[suffix] = Number(value);
      } else {
        range[suffix] = value;
      }
    }
  }

  for (const [fieldId, range] of rangeFields) {
    customFilters[fieldId] = range;
  }

  return {
    search: params.get('search') || '',
    assigneeIds: params.get('assignee')?.split(',').filter(Boolean) || [],
    priorities: params.get('priority')?.split(',').filter(Boolean) || [],
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    customFilters,
  };
}

/**
 * Хук для управления фильтрами, изолированными по workspace.
 * Фильтры синхронизируются с URL (приоритет) и localStorage (fallback).
 */
export function useWorkspaceFilters(workspaceId: string): [FilterState, (filters: FilterState) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isInitRef = useRef(false);

  const [filters, setFiltersInternal] = useState<FilterState>(() => {
    const fromUrl = urlParamsToFilters(searchParams);
    if (fromUrl) return fromUrl;
    return loadFilters(workspaceId);
  });

  // Synchronous state reset when workspace changes — ensures filters are
  // correct BEFORE effects run (avoids stale filters from previous workspace)
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId);
  if (prevWorkspaceId !== workspaceId) {
    setPrevWorkspaceId(workspaceId);
    isInitRef.current = false;
    const fromUrl = urlParamsToFilters(searchParams);
    setFiltersInternal(fromUrl || loadFilters(workspaceId));
  }

  // Sync filters to URL (after init)
  useEffect(() => {
    if (!isInitRef.current) {
      isInitRef.current = true;
      return;
    }

    const urlParams = filtersToUrlParams(filters);
    const newSearch = urlParams.toString();
    const currentSearch = typeof window !== 'undefined' ? window.location.search.slice(1) : '';

    if (newSearch !== currentSearch) {
      const newUrl = newSearch ? `${pathname}?${newSearch}` : pathname;
      window.history.replaceState(null, '', newUrl);
    }
  }, [filters, pathname]);

  const setFilters = useCallback(
    (newFilters: FilterState) => {
      setFiltersInternal(newFilters);
      saveFilters(workspaceId, newFilters);
    },
    [workspaceId],
  );

  return [filters, setFilters];
}
