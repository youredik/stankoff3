'use client';

import { useState, useEffect, useMemo } from 'react';
import { Link2, Plus, X, ExternalLink, Loader2 } from 'lucide-react';
import { entitiesApi } from '@/lib/api/entities';
import { workspacesApi } from '@/lib/api/workspaces';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';
import { useEntityStore } from '@/store/useEntityStore';
import type { Entity, Workspace } from '@/types';
import { RelatedEntityCard, EntityCardSkeleton, type FullEntityData } from './RelatedEntityCard';

interface LinkedEntitiesProps {
  entityId: string;
  linkedEntityIds: string[];
  onUpdate: (linkedEntityIds: string[]) => void;
  readOnly?: boolean;
}

export function LinkedEntities({
  entityId,
  linkedEntityIds,
  onUpdate,
  readOnly = false,
}: LinkedEntitiesProps) {
  const [fullEntities, setFullEntities] = useState<FullEntityData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [preloadedEntities, setPreloadedEntities] = useState<Entity[]>([]);
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingModal, setLoadingModal] = useState(false);
  const [searching, setSearching] = useState(false);

  const { openEntity } = useEntityNavigation();
  const users = useEntityStore((s) => s.users);

  // Стабильный ключ для сравнения массива
  const linkedIdsKey = useMemo(() => linkedEntityIds.join(','), [linkedEntityIds]);

  // Загрузка полных данных связанных сущностей + их workspace
  useEffect(() => {
    if (linkedEntityIds.length === 0) {
      setFullEntities([]);
      return;
    }

    let cancelled = false;
    const wsCache = new Map<string, Workspace>();

    const fetchLinkedEntities = async () => {
      setLoading(true);
      try {
        const results = await Promise.allSettled(
          linkedEntityIds.map(async (customId): Promise<FullEntityData | null> => {
            let entity: Entity | null = null;

            // 1. Найти entity через search по customId
            try {
              const searchResults = await entitiesApi.search(customId, 5);
              const match = searchResults.find(
                (r) => r.customId === customId || r.id === customId,
              );
              if (match) {
                entity = await entitiesApi.getById(match.id);
              }
            } catch { /* silent */ }

            // 2. Fallback: getById напрямую (если UUID)
            if (!entity) {
              try {
                entity = await entitiesApi.getById(customId);
              } catch { /* silent */ }
            }

            if (!entity) return null;

            // 3. Загрузить workspace (с кэшем)
            let workspace = wsCache.get(entity.workspaceId);
            if (!workspace) {
              try {
                workspace = await workspacesApi.getById(entity.workspaceId);
                wsCache.set(entity.workspaceId, workspace);
              } catch { /* silent */ }
            }

            if (!workspace) return null;

            return { entity, workspace };
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

    fetchLinkedEntities();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedIdsKey]);

  // Fetch workspaces + preload recent entities when modal opens
  useEffect(() => {
    if (!showAddModal) return;
    let cancelled = false;

    const init = async () => {
      setLoadingModal(true);
      try {
        const workspacesData = await workspacesApi.getAll();
        if (cancelled) return;
        setWorkspaces(workspacesData);

        const wsId = selectedWorkspaceId || (workspacesData.length > 0 ? workspacesData[0].id : '');
        if (!selectedWorkspaceId && wsId) setSelectedWorkspaceId(wsId);

        // Предзагрузка последних заявок
        if (wsId) {
          const result = await entitiesApi.getTable(wsId, {
            perPage: 15,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          });
          if (!cancelled) setPreloadedEntities(result.items);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoadingModal(false);
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal]);

  // Preload entities when workspace changes
  useEffect(() => {
    if (!showAddModal || !selectedWorkspaceId) return;
    let cancelled = false;

    const preload = async () => {
      setLoadingModal(true);
      try {
        const result = await entitiesApi.getTable(selectedWorkspaceId, {
          perPage: 15,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        });
        if (!cancelled) setPreloadedEntities(result.items);
      } catch { /* silent */ }
      if (!cancelled) setLoadingModal(false);
    };

    preload();
    return () => { cancelled = true; };
  }, [showAddModal, selectedWorkspaceId]);

  // Search entities with debounce
  useEffect(() => {
    if (!showAddModal || searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await entitiesApi.search(searchQuery, 20, selectedWorkspaceId || undefined);
        if (!cancelled) {
          setSearchResults(
            results.map((r) => ({
              id: r.id,
              customId: r.customId,
              title: r.title,
              status: r.status,
              priority: r.priority,
              workspaceId: r.workspaceId,
              assignee: r.assignee,
              data: {},
              createdAt: new Date(r.createdAt),
              updatedAt: new Date(r.createdAt),
            })) as Entity[],
          );
        }
      } catch { /* silent */ }
      if (!cancelled) setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [showAddModal, searchQuery, selectedWorkspaceId]);

  // Получить customId текущей заявки из store
  const currentCustomId = useEntityStore((s) => s.selectedEntity?.customId);

  const handleRemoveLink = async (targetCustomId: string) => {
    // 1. Убираем связь у текущей заявки
    onUpdate(linkedEntityIds.filter((id) => id !== targetCustomId));

    // 2. Обратная связь: убираем текущую заявку из linkedEntityIds целевой
    if (currentCustomId) {
      try {
        const targetData = fullEntities.find((d) => d.entity.customId === targetCustomId);
        if (targetData) {
          const targetLinked = targetData.entity.linkedEntityIds || [];
          if (targetLinked.includes(currentCustomId)) {
            await entitiesApi.update(targetData.entity.id, {
              linkedEntityIds: targetLinked.filter((id) => id !== currentCustomId),
            } as Partial<Entity>);
          }
        }
      } catch {
        // Обратная связь — best effort
      }
    }
  };

  const handleAddLink = async (targetCustomId: string) => {
    // 1. Добавляем связь у текущей заявки
    if (!linkedEntityIds.includes(targetCustomId)) {
      onUpdate([...linkedEntityIds, targetCustomId]);
    }

    // 2. Обратная связь: добавляем текущую заявку в linkedEntityIds целевой
    if (currentCustomId) {
      try {
        // Находим целевую заявку (из результатов поиска в модалке)
        const targetSearchEntity = sourceEntities.find((e) => e.customId === targetCustomId);
        if (targetSearchEntity) {
          // Загружаем полные данные целевой заявки
          const targetFull = await entitiesApi.getById(targetSearchEntity.id);
          const targetLinked = targetFull.linkedEntityIds || [];
          if (!targetLinked.includes(currentCustomId)) {
            await entitiesApi.update(targetFull.id, {
              linkedEntityIds: [...targetLinked, currentCustomId],
            } as Partial<Entity>);
          }
        }
      } catch {
        // Обратная связь — best effort
      }
    }

    setShowAddModal(false);
    setSearchQuery('');
  };

  // Источник: поиск или предзагрузка
  const sourceEntities = searchQuery.length >= 1 ? searchResults : preloadedEntities;

  // Filter entities for add modal
  // При поиске — не фильтруем по workspace (search API ищет по всем доступным)
  const filteredEntities = sourceEntities.filter((e) => {
    if (e.id === entityId) return false;
    if (linkedEntityIds.includes(e.customId)) return false;
    return true;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          <Link2 className="w-3.5 h-3.5" />
          <span>Связи</span>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowAddModal(true)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Добавить связь"
            aria-label="Добавить связь"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Загрузка */}
      {loading && linkedEntityIds.map((id) => <EntityCardSkeleton key={id} />)}

      {/* Пусто */}
      {!loading && fullEntities.length === 0 && linkedEntityIds.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">Нет связей</p>
      )}

      {/* Карточки связанных сущностей */}
      {!loading && fullEntities.length > 0 && (
        <div className="space-y-2">
          {fullEntities.map((data) => (
            <RelatedEntityCard
              key={data.entity.id}
              data={data}
              users={users}
              canEdit={!readOnly}
              onRemove={() => handleRemoveLink(data.entity.customId)}
              onNavigate={() => openEntity(data.entity.id)}
            />
          ))}
        </div>
      )}

      {/* Add Link Modal */}
      {showAddModal && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-50"
            onClick={() => setShowAddModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Добавить связь</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <select
                  value={selectedWorkspaceId}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Все рабочие места</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.icon} {ws.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по ID или названию..."
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />

                {/* Подсказка */}
                {!searchQuery && !loadingModal && filteredEntities.length > 0 && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Последние заявки · начните вводить для поиска
                  </p>
                )}

                <div className="max-h-64 overflow-y-auto space-y-1">
                  {/* Загрузка */}
                  {(loadingModal || searching) && (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      <span className="text-sm text-gray-400">
                        {searching ? 'Поиск...' : 'Загрузка...'}
                      </span>
                    </div>
                  )}

                  {/* Пусто */}
                  {!loadingModal && !searching && filteredEntities.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                      {searchQuery ? 'Ничего не найдено' : 'Нет доступных заявок'}
                    </p>
                  )}

                  {/* Список */}
                  {!loadingModal && !searching && filteredEntities.slice(0, 20).map((entity) => {
                    const workspace = workspaces.find((w) => w.id === entity.workspaceId);
                    return (
                      <button
                        key={entity.id}
                        onClick={() => handleAddLink(entity.customId)}
                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <span className="text-sm">{workspace?.icon || '📋'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                              {entity.customId}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {workspace?.name}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {entity.title}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
