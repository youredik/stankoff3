'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Link2,
  Plus,
  ExternalLink,
  Trash2,
  ArrowRight,
  ArrowLeftRight,
  Copy,
  GitBranch,
  Loader2,
} from 'lucide-react';
import type { EntityLink, EntityLinkType, Entity } from '@/types';
import { entityLinksApi } from '@/lib/api/entity-links';

interface EntityLinksListProps {
  entityId: string;
  onNavigateToEntity?: (entityId: string) => void;
  canManage?: boolean;
}

const linkTypeConfig: Record<
  EntityLinkType,
  { label: string; reverseLabel: string; icon: React.ElementType; color: string }
> = {
  spawned: {
    label: 'Создал',
    reverseLabel: 'Создан из',
    icon: GitBranch,
    color: 'text-green-600',
  },
  blocks: {
    label: 'Блокирует',
    reverseLabel: 'Блокируется',
    icon: ArrowRight,
    color: 'text-red-600',
  },
  blocked_by: {
    label: 'Блокируется',
    reverseLabel: 'Блокирует',
    icon: ArrowRight,
    color: 'text-orange-600',
  },
  related: {
    label: 'Связано с',
    reverseLabel: 'Связано с',
    icon: ArrowLeftRight,
    color: 'text-blue-600',
  },
  duplicate: {
    label: 'Дубликат',
    reverseLabel: 'Дубликат',
    icon: Copy,
    color: 'text-purple-600',
  },
  parent: {
    label: 'Родитель',
    reverseLabel: 'Дочерняя',
    icon: ArrowRight,
    color: 'text-teal-600',
  },
  child: {
    label: 'Дочерняя',
    reverseLabel: 'Родитель',
    icon: ArrowRight,
    color: 'text-cyan-600',
  },
};

export function EntityLinksList({
  entityId,
  onNavigateToEntity,
  canManage = true,
}: EntityLinksListProps) {
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await entityLinksApi.getByEntity(entityId);
      setLinks(data);
    } catch (err) {
      setError('Не удалось загрузить связи');
      console.error('Failed to fetch links:', err);
    } finally {
      setIsLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleDelete = async (linkId: string) => {
    if (!confirm('Удалить связь?')) return;
    setDeletingId(linkId);
    try {
      await entityLinksApi.delete(linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      console.error('Failed to delete link:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const getLinkedEntity = (link: EntityLink): Entity | undefined => {
    // Determine which entity is the "other" one
    if (link.sourceEntityId === entityId) {
      return link.targetEntity;
    }
    return link.sourceEntity;
  };

  const getLinkLabel = (link: EntityLink): string => {
    const config = linkTypeConfig[link.linkType];
    if (!config) return link.linkType;
    // If we're the source, use label; if we're target, use reverseLabel
    return link.sourceEntityId === entityId ? config.label : config.reverseLabel;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        {error}
        <button
          onClick={fetchLinks}
          className="ml-2 text-teal-600 hover:text-teal-700"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 dark:text-gray-400">
        <Link2 className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm">Нет связанных заявок</p>
      </div>
    );
  }

  // Group links by type
  const groupedLinks = links.reduce(
    (acc, link) => {
      const label = getLinkLabel(link);
      if (!acc[label]) acc[label] = [];
      acc[label].push(link);
      return acc;
    },
    {} as Record<string, EntityLink[]>
  );

  return (
    <div className="space-y-4">
      {Object.entries(groupedLinks).map(([label, linkGroup]) => (
        <div key={label}>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {label}
          </h4>
          <div className="space-y-2">
            {linkGroup.map((link) => {
              const linkedEntity = getLinkedEntity(link);
              const config = linkTypeConfig[link.linkType];
              const Icon = config?.icon || Link2;

              return (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${config?.color || 'text-gray-500'}`} />
                    {linkedEntity ? (
                      <button
                        onClick={() => onNavigateToEntity?.(linkedEntity.id)}
                        className="flex items-center gap-1 min-w-0 text-left hover:text-teal-600 transition-colors"
                      >
                        <span className="font-medium text-sm truncate">
                          {linkedEntity.customId}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 text-sm truncate">
                          {linkedEntity.title}
                        </span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100" />
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {link.sourceEntityId === entityId
                          ? link.targetEntityId
                          : link.sourceEntityId}
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <button
                      onClick={() => handleDelete(link.id)}
                      disabled={deletingId === link.id}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    >
                      {deletingId === link.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default EntityLinksList;
