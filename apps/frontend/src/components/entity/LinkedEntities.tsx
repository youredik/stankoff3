'use client';

import { useState, useEffect, useMemo } from 'react';
import { Link2, Plus, X, ExternalLink, Loader2 } from 'lucide-react';
import { entitiesApi } from '@/lib/api/entities';
import { workspacesApi } from '@/lib/api/workspaces';
import type { Entity, Workspace } from '@/types';

interface LinkedEntitiesProps {
  entityId: string;
  linkedEntityIds: string[];
  onUpdate: (linkedEntityIds: string[]) => void;
  readOnly?: boolean;
}

interface LinkedEntityInfo {
  id: string;
  customId: string;
  title: string;
  status: string;
  workspaceName: string;
  workspaceIcon: string;
}

export function LinkedEntities({
  entityId,
  linkedEntityIds,
  onUpdate,
  readOnly = false,
}: LinkedEntitiesProps) {
  const [linkedEntities, setLinkedEntities] = useState<LinkedEntityInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Стабильный ключ для сравнения массива (вместо reference equality)
  const linkedIdsKey = useMemo(() => linkedEntityIds.join(','), [linkedEntityIds]);

  // Fetch linked entity details
  useEffect(() => {
    if (linkedEntityIds.length === 0) {
      setLinkedEntities([]);
      return;
    }

    const fetchLinkedEntities = async () => {
      setLoading(true);
      try {
        const [workspacesData, entitiesData] = await Promise.all([
          workspacesApi.getAll(),
          Promise.all(
            linkedEntityIds.map(async (customId) => {
              // linkedEntityIds are customIds like "REK-445"
              // We need to fetch all entities and find by customId
              return customId;
            })
          ),
        ]);

        // Fetch all entities to find by customId
        const allWorkspaceEntities: Entity[] = [];
        for (const ws of workspacesData) {
          try {
            const wsEntities = await entitiesApi.getByWorkspace(ws.id);
            allWorkspaceEntities.push(...wsEntities);
          } catch {
            // ignore
          }
        }

        const linked: LinkedEntityInfo[] = [];
        for (const customId of linkedEntityIds) {
          const entity = allWorkspaceEntities.find(
            (e) => e.customId === customId
          );
          if (entity) {
            const workspace = workspacesData.find(
              (w) => w.id === entity.workspaceId
            );
            linked.push({
              id: entity.id,
              customId: entity.customId,
              title: entity.title,
              status: entity.status,
              workspaceName: workspace?.name || 'Неизвестно',
              workspaceIcon: workspace?.icon || '📋',
            });
          } else {
            // Entity not found but still show the customId
            linked.push({
              id: customId,
              customId,
              title: 'Не найдено',
              status: '',
              workspaceName: '',
              workspaceIcon: '❓',
            });
          }
        }

        setLinkedEntities(linked);
        setWorkspaces(workspacesData);
      } catch {
        // silent
      }
      setLoading(false);
    };

    fetchLinkedEntities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedIdsKey]); // Используем стабильный ключ вместо массива

  // Fetch entities for add modal (только при открытии модалки)
  useEffect(() => {
    if (!showAddModal) return;

    let cancelled = false;

    const fetchAll = async () => {
      try {
        const workspacesData = await workspacesApi.getAll();
        if (cancelled) return;

        setWorkspaces(workspacesData);

        if (workspacesData.length > 0) {
          setSelectedWorkspaceId((prev) => prev || workspacesData[0].id);
        }

        const allEntitiesData: Entity[] = [];
        for (const ws of workspacesData) {
          if (cancelled) return;
          const wsEntities = await entitiesApi.getByWorkspace(ws.id);
          allEntitiesData.push(...wsEntities);
        }
        if (!cancelled) {
          setAllEntities(allEntitiesData);
        }
      } catch {
        // silent
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [showAddModal]); // Убрали selectedWorkspaceId — он менялся внутри эффекта

  const handleRemoveLink = (customId: string) => {
    const updated = linkedEntityIds.filter((id) => id !== customId);
    onUpdate(updated);
  };

  const handleAddLink = (customId: string) => {
    if (!linkedEntityIds.includes(customId)) {
      onUpdate([...linkedEntityIds, customId]);
    }
    setShowAddModal(false);
    setSearchQuery('');
  };

  // Filter entities for add modal
  const filteredEntities = allEntities.filter((e) => {
    // Don't show current entity
    if (e.id === entityId) return false;
    // Don't show already linked
    if (linkedEntityIds.includes(e.customId)) return false;
    // Filter by workspace
    if (selectedWorkspaceId && e.workspaceId !== selectedWorkspaceId)
      return false;
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        e.customId.toLowerCase().includes(query) ||
        e.title.toLowerCase().includes(query)
      );
    }
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
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin" />
        </div>
      )}

      {!loading && linkedEntities.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">Нет связей</p>
      )}

      {!loading && linkedEntities.length > 0 && (
        <div className="space-y-1">
          {linkedEntities.map((entity) => (
            <div
              key={entity.id}
              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group"
            >
              <span className="text-sm">{entity.workspaceIcon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {entity.customId}
                  </span>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{entity.title}</p>
              </div>
              {!readOnly && (
                <button
                  onClick={() => handleRemoveLink(entity.customId)}
                  className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Удалить связь"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
                {/* Workspace selector */}
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

                {/* Search */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по ID или названию..."
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />

                {/* Entity list */}
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredEntities.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                      Нет доступных сущностей
                    </p>
                  )}
                  {filteredEntities.slice(0, 20).map((entity) => {
                    const workspace = workspaces.find(
                      (w) => w.id === entity.workspaceId
                    );
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
