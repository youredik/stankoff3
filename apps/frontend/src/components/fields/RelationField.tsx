'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, X, Loader2, Search } from 'lucide-react';
import { entitiesApi, type SearchResult } from '@/lib/api/entities';
import { workspacesApi } from '@/lib/api/workspaces';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';
import type { Entity, Workspace, RelationFieldConfig } from '@/types';
import {
  RelatedEntityCard, EntityCardSkeleton, type FullEntityData,
} from '@/components/entity/RelatedEntityCard';
import type { FieldRenderer } from './types';

// --- Утилиты ---

function normalizeValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean) as string[];
  if (typeof value === 'string' && value) return [value];
  return [];
}

function isSingleRelation(config?: RelationFieldConfig): boolean {
  return config?.relationType === 'one-to-one';
}

// --- Inline поиск ---

function RelationSearchDropdown({
  relatedWorkspaceId,
  excludeIds,
  onSelect,
  onClose,
}: {
  relatedWorkspaceId?: string;
  excludeIds: string[];
  onSelect: (customId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await entitiesApi.search(query, 20);
        if (!cancelled) {
          setResults(
            data.filter((r) => {
              if (relatedWorkspaceId && r.workspaceId !== relatedWorkspaceId) return false;
              if (excludeIds.includes(r.customId) || excludeIds.includes(r.id)) return false;
              return true;
            }),
          );
        }
      } catch { /* silent */ }
      if (!cancelled) setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, relatedWorkspaceId, excludeIds]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', handleKey, true);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div ref={containerRef} className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 shadow-lg">
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по ID или названию..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        )}
        {!searching && results.length === 0 && query.length >= 2 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Ничего не найдено</p>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.customId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-sm flex-shrink-0">{r.workspaceIcon || '📋'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{r.customId}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.workspaceName}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{r.title}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Загрузка полных данных entity + workspace ---

function useFullEntityData(ids: string[]) {
  const idsKey = useMemo(() => ids.join(','), [ids]);
  const [fullEntities, setFullEntities] = useState<FullEntityData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ids.length === 0) {
      setFullEntities([]);
      return;
    }
    let cancelled = false;
    const wsCache = new Map<string, Workspace>();

    const load = async () => {
      setLoading(true);
      try {
        const results = await Promise.allSettled(
          ids.map(async (idOrCustomId): Promise<FullEntityData | null> => {
            let entity: Entity | null = null;

            try {
              const searchResults = await entitiesApi.search(idOrCustomId, 5);
              const match = searchResults.find(
                (r) => r.customId === idOrCustomId || r.id === idOrCustomId,
              );
              if (match) entity = await entitiesApi.getById(match.id);
            } catch { /* silent */ }

            if (!entity) {
              try { entity = await entitiesApi.getById(idOrCustomId); } catch { /* silent */ }
            }

            if (!entity) return null;

            let workspace = wsCache.get(entity.workspaceId);
            if (!workspace) {
              try {
                workspace = await workspacesApi.getById(entity.workspaceId);
                wsCache.set(entity.workspaceId, workspace);
              } catch { /* silent */ }
            }

            return workspace ? { entity, workspace } : null;
          }),
        );

        if (!cancelled) {
          setFullEntities(
            results
              .filter((r): r is PromiseFulfilledResult<FullEntityData | null> => r.status === 'fulfilled')
              .map((r) => r.value)
              .filter((v): v is FullEntityData => v !== null),
          );
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { fullEntities, loading };
}

// --- Основной рендерер ---

function RelationRenderer({ field, value, users, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const config = field.config as RelationFieldConfig | undefined;
  const single = isSingleRelation(config);
  const ids = normalizeValue(value);

  const { openEntity } = useEntityNavigation();
  const { fullEntities, loading } = useFullEntityData(ids);
  const [showSearch, setShowSearch] = useState(false);

  const handleRemove = useCallback(
    (customId: string) => {
      const newIds = ids.filter((id) => id !== customId);
      onUpdate(single ? newIds[0] || null : newIds);
    },
    [ids, single, onUpdate],
  );

  const handleAdd = useCallback(
    (customId: string) => {
      if (single) {
        onUpdate(customId);
      } else {
        if (!ids.includes(customId)) onUpdate([...ids, customId]);
      }
      setShowSearch(false);
    },
    [ids, single, onUpdate],
  );

  const closeSearch = useCallback(() => setShowSearch(false), []);

  return (
    <div className="space-y-2">
      {loading && ids.map((id) => <EntityCardSkeleton key={id} />)}

      {!loading && fullEntities.length === 0 && ids.length === 0 && !showSearch && (
        <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
      )}

      {!loading &&
        fullEntities.map((data) => (
          <RelatedEntityCard
            key={data.entity.id}
            data={data}
            users={users}
            canEdit={canEdit}
            onRemove={() => handleRemove(data.entity.customId)}
            onNavigate={() => openEntity(data.entity.id)}
          />
        ))}

      {canEdit && (!single || ids.length === 0) && !showSearch && (
        <button
          onClick={() => setShowSearch(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить связь
        </button>
      )}

      {showSearch && (
        <RelationSearchDropdown
          relatedWorkspaceId={field.relatedWorkspaceId}
          excludeIds={ids}
          onSelect={handleAdd}
          onClose={closeSearch}
        />
      )}
    </div>
  );
}

// --- Форма для CreateEntityModal ---

function RelationForm({ field, value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as RelationFieldConfig | undefined;
  const single = isSingleRelation(config);
  const ids = normalizeValue(value);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await entitiesApi.search(query, 20);
        if (!cancelled) {
          setResults(
            data.filter((r) => {
              if (field.relatedWorkspaceId && r.workspaceId !== field.relatedWorkspaceId) return false;
              if (ids.includes(r.customId) || ids.includes(r.id)) return false;
              return true;
            }),
          );
        }
      } catch { /* silent */ }
      if (!cancelled) setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, field.relatedWorkspaceId, ids]);

  const handleSelect = (result: SearchResult) => {
    if (single) {
      onChange(result.customId);
      setSelected([result]);
    } else {
      onChange([...ids, result.customId]);
      setSelected((prev) => [...prev, result]);
    }
    setQuery('');
    setResults([]);
  };

  const handleRemove = (customId: string) => {
    onChange(single ? null : ids.filter((id) => id !== customId));
    setSelected((prev) => prev.filter((e) => e.customId !== customId));
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-full text-xs"
            >
              {e.workspaceIcon} {e.customId} — {e.title}
              <button onClick={() => handleRemove(e.customId)} className="hover:opacity-70" aria-label="Удалить">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {(!single || ids.length === 0) && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск заявки по ID или названию..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {(results.length > 0 || searching) && (
            <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              {searching && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                >
                  <span className="text-sm flex-shrink-0">{r.workspaceIcon || '📋'}</span>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{r.customId}</span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{r.title}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const relationFieldRenderer: FieldRenderer = {
  Renderer: RelationRenderer,
  Form: RelationForm,
};
