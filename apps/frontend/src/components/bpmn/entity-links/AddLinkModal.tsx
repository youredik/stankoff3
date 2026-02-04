'use client';

import { useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import type { EntityLink, EntityLinkType, Entity } from '@/types';
import { entityLinksApi } from '@/lib/api/entity-links';

interface AddLinkModalProps {
  sourceEntityId: string;
  onSave: (link: EntityLink) => void;
  onClose: () => void;
  searchEntities: (query: string) => Promise<Entity[]>;
}

const linkTypes: { value: EntityLinkType; label: string; description: string }[] = [
  { value: 'related', label: 'Связано', description: 'Связанные заявки' },
  { value: 'blocks', label: 'Блокирует', description: 'Эта заявка блокирует другую' },
  { value: 'blocked_by', label: 'Блокируется', description: 'Эта заявка блокируется другой' },
  { value: 'parent', label: 'Родительская', description: 'Родительская заявка' },
  { value: 'child', label: 'Дочерняя', description: 'Дочерняя заявка' },
  { value: 'duplicate', label: 'Дубликат', description: 'Дубликат этой заявки' },
];

export function AddLinkModal({
  sourceEntityId,
  onSave,
  onClose,
  searchEntities,
}: AddLinkModalProps) {
  const [linkType, setLinkType] = useState<EntityLinkType>('related');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setIsSearching(true);
    try {
      const results = await searchEntities(searchQuery);
      // Filter out the source entity
      setSearchResults(results.filter((e) => e.id !== sourceEntityId));
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedEntity) {
      setError('Выберите заявку');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const link = await entityLinksApi.create({
        sourceEntityId,
        targetEntityId: selectedEntity.id,
        linkType,
      });
      onSave(link);
    } catch (err) {
      setError('Не удалось создать связь');
      console.error('Failed to create link:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Добавить связь
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Link type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Тип связи
            </label>
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as EntityLinkType)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {linkTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {linkTypes.find((t) => t.value === linkType)?.description}
            </p>
          </div>

          {/* Entity search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Найти заявку
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="ID или название заявки"
                  className="w-full pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searchQuery.length < 2 || isSearching}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Найти'
                )}
              </button>
            </div>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              {searchResults.map((entity) => (
                <label
                  key={entity.id}
                  className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                    selectedEntity?.id === entity.id
                      ? 'bg-teal-50 dark:bg-teal-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="target-entity"
                    value={entity.id}
                    checked={selectedEntity?.id === entity.id}
                    onChange={() => setSelectedEntity(entity)}
                    className="sr-only"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      {entity.customId}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {entity.title}
                    </p>
                  </div>
                  <span
                    className={`ml-auto px-2 py-0.5 text-xs rounded ${
                      entity.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}
                  >
                    {entity.status}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Selected entity */}
          {selectedEntity && (
            <div className="p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
              <p className="text-sm text-teal-800 dark:text-teal-200">
                Выбрано: <strong>{selectedEntity.customId}</strong> — {selectedEntity.title}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedEntity || isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Создать связь
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddLinkModal;
