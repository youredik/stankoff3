'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEntityStore } from '@/store/useEntityStore';

/**
 * Синхронизация URL query param ?entity=:id с useEntityStore.
 *
 * URL → Store:
 * - При наличии ?entity=id — вызывает selectEntity(id)
 * - При отсутствии ?entity — вызывает deselectEntity()
 *
 * Используется в workspace page для обеспечения deep linking.
 */
export function useEntitySync() {
  const searchParams = useSearchParams();
  const entityId = searchParams.get('entity');
  const { selectedEntity, selectEntity, deselectEntity } = useEntityStore();
  const prevEntityId = useRef<string | null>(null);

  useEffect(() => {
    // Избегаем лишних вызовов если ID не изменился
    if (entityId === prevEntityId.current) return;
    prevEntityId.current = entityId;

    if (entityId) {
      // Загружаем entity если ещё не загружена или другая
      if (!selectedEntity || selectedEntity.id !== entityId) {
        selectEntity(entityId);
      }
    } else if (selectedEntity) {
      deselectEntity();
    }
  }, [entityId, selectedEntity, selectEntity, deselectEntity]);
}
