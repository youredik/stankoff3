'use client';

import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { Search, ChevronDown, X, Check, Plus } from 'lucide-react';

export interface SearchableSelectOption {
  id: string;
}

export interface SearchableSelectProps<T extends SearchableSelectOption> {
  options: T[];
  value: string | string[] | null;
  onChange: (value: string | string[] | null) => void;

  multi?: boolean;

  getSearchText: (item: T) => string;
  searchPlaceholder?: string;

  renderOption?: (item: T, ctx: { isSelected: boolean }) => ReactNode;
  renderSelectedSingle?: (item: T) => ReactNode;
  renderSelectedMultiTag?: (item: T, onRemove: () => void) => ReactNode;

  emptyLabel?: string;
  showEmptyOption?: boolean;
  noResultsLabel?: string;
  placeholder?: string;

  allowCreate?: boolean;
  onCreateOption?: (searchTerm: string) => void;
  createLabel?: (searchTerm: string) => string;

  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export default function SearchableSelect<T extends SearchableSelectOption>({
  options,
  value,
  onChange,
  multi = false,
  getSearchText,
  searchPlaceholder = 'Поиск...',
  renderOption,
  renderSelectedSingle,
  renderSelectedMultiTag,
  emptyLabel = 'Не выбрано',
  showEmptyOption,
  noResultsLabel = 'Не найдено',
  placeholder = 'Не выбрано',
  allowCreate = false,
  onCreateOption,
  createLabel,
  disabled = false,
  compact = false,
  className = '',
}: SearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showEmpty = showEmptyOption ?? !multi;

  const selectedIds: string[] = useMemo(() => {
    if (multi) return Array.isArray(value) ? value : value ? [value] : [];
    return [];
  }, [multi, value]);

  const selectedSingle = useMemo(() => {
    if (multi) return null;
    return options.find((o) => o.id === value) ?? null;
  }, [multi, options, value]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const q = searchTerm.toLowerCase().trim();
    return options.filter((o) => getSearchText(o).toLowerCase().includes(q));
  }, [options, searchTerm, getSearchText]);

  const canCreateNew = allowCreate && searchTerm.trim() &&
    !options.some((o) => getSearchText(o).toLowerCase() === searchTerm.trim().toLowerCase());

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  }, []);

  const handleSelectSingle = (id: string | null) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  const toggleMulti = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((i) => i !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const handleCreate = () => {
    onCreateOption?.(searchTerm.trim());
    setSearchTerm('');
  };

  const defaultRenderOption = (item: T, { isSelected }: { isSelected: boolean }) => (
    <span className={isSelected ? 'font-medium' : ''}>{getSearchText(item)}</span>
  );

  const render = renderOption ?? defaultRenderOption;

  const baseButton = compact
    ? 'text-xs border rounded-lg px-2 py-1 max-w-[160px]'
    : 'w-full border rounded px-3 py-2 text-sm';

  // --- Trigger content ---
  let triggerContent: ReactNode;
  if (multi) {
    if (selectedIds.length > 0) {
      triggerContent = (
        <div className="flex flex-wrap gap-1 items-center">
          {selectedIds.map((id) => {
            const item = options.find((o) => o.id === id);
            if (!item) return null;
            if (renderSelectedMultiTag) {
              return <span key={id}>{renderSelectedMultiTag(item, () => toggleMulti(id))}</span>;
            }
            return (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded text-xs">
                {getSearchText(item)}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleMulti(id); }} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      );
    } else {
      triggerContent = <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>;
    }
  } else if (selectedSingle) {
    triggerContent = renderSelectedSingle
      ? renderSelectedSingle(selectedSingle)
      : <span className="truncate">{getSearchText(selectedSingle)}</span>;
  } else {
    triggerContent = <span className="text-gray-400 dark:text-gray-500 truncate">{placeholder}</span>;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`${baseButton} flex items-center justify-between gap-1 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px]`}
      >
        <span className="flex-1 text-left truncate">{triggerContent}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Поиск"
                className="w-full pl-8 pr-7 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-900 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Очистить поиск"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto py-1">
            {/* Empty option (single mode) */}
            {showEmpty && !multi && (
              <button
                type="button"
                onClick={() => handleSelectSingle(null)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  !value
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {emptyLabel}
              </button>
            )}

            {filtered.map((item) => {
              const isSelected = multi ? selectedIds.includes(item.id) : value === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => multi ? toggleMulti(item.id) : handleSelectSingle(item.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-gray-900 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {multi && (
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  )}
                  <span className="flex-1">{render(item, { isSelected })}</span>
                </button>
              );
            })}

            {filtered.length === 0 && !canCreateNew && (
              <p className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">
                {noResultsLabel}
              </p>
            )}

            {canCreateNew && (
              <button
                type="button"
                onClick={handleCreate}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 border-t border-gray-200 dark:border-gray-700"
              >
                <Plus className="w-4 h-4" />
                {createLabel ? createLabel(searchTerm.trim()) : `Создать «${searchTerm.trim()}»`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
