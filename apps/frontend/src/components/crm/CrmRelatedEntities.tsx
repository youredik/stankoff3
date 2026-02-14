'use client';

import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import { entitiesApi, type RelatedEntityItem } from '@/lib/api/entities';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';

interface CrmRelatedEntitiesProps {
  entityId: string;
  /** Исключить workspace (чтобы не показывать entity из того же workspace) */
  excludeWorkspaceId?: string;
}

export function CrmRelatedEntities({ entityId, excludeWorkspaceId }: CrmRelatedEntitiesProps) {
  const [items, setItems] = useState<RelatedEntityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { openEntity } = useEntityNavigation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    entitiesApi
      .getRelated(entityId, 30)
      .then((res) => {
        if (cancelled) return;
        const filtered = excludeWorkspaceId
          ? res.items.filter((i) => i.workspaceId !== excludeWorkspaceId)
          : res.items;
        setItems(filtered);
        setTotal(res.total);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityId, excludeWorkspaceId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загрузка связей...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-3 text-sm text-gray-400">
        Нет связанных заявок
      </div>
    );
  }

  // Группируем по workspace
  const grouped = new Map<string, { name: string; icon: string; items: RelatedEntityItem[] }>();
  for (const item of items) {
    const key = item.workspaceId;
    if (!grouped.has(key)) {
      grouped.set(key, { name: item.workspaceName, icon: item.workspaceIcon, items: [] });
    }
    grouped.get(key)!.items.push(item);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Связанные заявки ({total})
      </div>
      {[...grouped.entries()].map(([wsId, group]) => (
        <div key={wsId}>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <span>{group.icon}</span>
            <span>{group.name}</span>
            <span className="text-gray-400">({group.items.length})</span>
          </div>
          <div className="space-y-1">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => openEntity(item.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
              >
                <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-500 dark:text-gray-400 text-xs font-mono flex-shrink-0">
                  {item.customId}
                </span>
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {item.title}
                </span>
                <ExternalLink className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 ml-auto flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
