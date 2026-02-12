'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, X, ExternalLink } from 'lucide-react';
import { entitiesApi } from '@/lib/api/entities';
import type { Entity } from '@/types';

export interface EntityPickerValue {
  id: string;
  customId: string;
  workspaceId: string;
}

interface EntityPickerProps {
  workspaceId: string;
  value?: EntityPickerValue | null;
  onChange: (entity: EntityPickerValue | null) => void;
  placeholder?: string;
  displayFields?: string[];
  disabled?: boolean;
  className?: string;
}

/**
 * Универсальный компонент выбора entity из любого workspace.
 * Используется в relation-полях для связей между workspace.
 */
export default function EntityPicker({
  workspaceId,
  value,
  onChange,
  placeholder = 'Выберите...',
  displayFields,
  disabled = false,
  className = '',
}: EntityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Загрузка entity по поиску (debounce)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const loadEntities = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const result = await entitiesApi.getTable(workspaceId, {
        search: q || undefined,
        perPage: 20,
        page: 1,
      });
      setEntities(result.items);
    } catch {
      setEntities([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    loadEntities(search);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => loadEntities(val), 300);
  };

  // Закрытие по клику вне
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Focus input при открытии
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    // Пробуем найти в загруженных
    const found = entities.find((e) => e.id === value.id);
    if (found) return `${found.customId} — ${found.title}`;
    return value.customId;
  }, [value, entities]);

  const handleSelect = (entity: Entity) => {
    onChange({
      id: entity.id,
      customId: entity.customId,
      workspaceId,
    });
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const getSubtitle = (entity: Entity): string => {
    if (!displayFields?.length || !entity.data) return '';
    return displayFields
      .map((f) => entity.data?.[f])
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm border rounded-lg transition-colors ${
          disabled
            ? 'bg-gray-50 dark:bg-gray-800 cursor-not-allowed'
            : 'bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500 cursor-pointer'
        } ${
          isOpen
            ? 'border-primary-500 ring-1 ring-primary-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        {value ? (
          <>
            <span className="flex-1 truncate text-gray-900 dark:text-gray-100">
              {selectedLabel}
            </span>
            <X
              className="w-4 h-4 text-gray-400 hover:text-gray-600 flex-shrink-0"
              onClick={handleClear}
            />
          </>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Поиск..."
              className="flex-1 text-sm bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Results */}
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">Загрузка...</div>
            ) : entities.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">Ничего не найдено</div>
            ) : (
              entities.map((entity) => {
                const subtitle = getSubtitle(entity);
                return (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => handleSelect(entity)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${
                      value?.id === entity.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500">{entity.customId}</span>
                        <span className="text-sm truncate text-gray-900 dark:text-gray-100">{entity.title}</span>
                      </div>
                      {subtitle && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</div>
                      )}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
