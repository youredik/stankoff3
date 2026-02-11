'use client';

import { useState, useEffect, useRef } from 'react';
import type { FilterState } from '@/components/kanban/FilterPanel';
import type { FacetResult } from '@/types';
import { entitiesApi } from '@/lib/api/entities';
import { filtersToApi } from '@/lib/utils/filters';

/**
 * Хук для загрузки фасетных данных (значения + счётчики) на основе текущих фильтров.
 * Автоматически перезагружает фасеты при изменении фильтров (debounce 200ms).
 */
export function useFacets(workspaceId: string, filters: FilterState) {
  const [facets, setFacets] = useState<FacetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Отменяем предыдущий запрос
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const apiFilters = filtersToApi(filters);
        const data = await entitiesApi.getFacets(workspaceId, apiFilters);
        if (!controller.signal.aborted) {
          setFacets(data);
        }
      } catch {
        // Игнорируем ошибки отменённых запросов
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [workspaceId, filters]);

  return { facets, loading };
}
