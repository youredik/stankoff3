'use client';

import { useEffect } from 'react';

/**
 * Предупреждает пользователя при попытке закрыть/обновить страницу
 * если есть несохранённые изменения.
 */
export function useBeforeUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Стандартный способ — returnValue устанавливается для совместимости
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
