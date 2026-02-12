'use client';

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Навигация к entity через URL query param ?entity=:id
 * Сохраняет все существующие query params (view, фильтры).
 */
export function useEntityNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const openEntity = useCallback((entityId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('entity', entityId);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const closeEntity = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('entity');
    const qs = params.toString();
    router.push(`${pathname}${qs ? '?' + qs : ''}`);
  }, [router, pathname, searchParams]);

  return { openEntity, closeEntity };
}
