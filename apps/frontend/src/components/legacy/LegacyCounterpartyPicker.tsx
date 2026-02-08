'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Building, Loader2, ExternalLink } from 'lucide-react';
import { legacyApi, legacyUrls } from '@/lib/api/legacy';
import type { LegacyCounterparty } from '@/types/legacy';

interface LegacyCounterpartyPickerProps {
  /** Выбранный контрагент (ID) */
  value?: number | null;
  /** Callback при выборе контрагента */
  onChange: (counterparty: LegacyCounterparty | null) => void;
  /** Placeholder для поля поиска */
  placeholder?: string;
  /** Отключить компонент */
  disabled?: boolean;
  /** CSS класс для контейнера */
  className?: string;
  /** Показывать ссылку на Legacy CRM */
  showLegacyLink?: boolean;
}

/**
 * Компонент выбора контрагента (компании) из Legacy CRM
 *
 * Использование:
 * ```tsx
 * <LegacyCounterpartyPicker
 *   value={counterpartyId}
 *   onChange={(cp) => setCounterpartyId(cp?.id ?? null)}
 *   placeholder="Выберите компанию"
 * />
 * ```
 */
export function LegacyCounterpartyPicker({
  value,
  onChange,
  placeholder = 'Поиск компании...',
  disabled = false,
  className = '',
  showLegacyLink = true,
}: LegacyCounterpartyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [counterparties, setCounterparties] = useState<LegacyCounterparty[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCounterparty, setSelectedCounterparty] = useState<LegacyCounterparty | null>(null);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Загружаем выбранного контрагента по ID при инициализации
  useEffect(() => {
    if (value && !selectedCounterparty) {
      legacyApi.getCounterparty(value)
        .then(setSelectedCounterparty)
        .catch(() => setSelectedCounterparty(null));
    } else if (!value) {
      setSelectedCounterparty(null);
    }
  }, [value, selectedCounterparty]);

  // Поиск контрагентов с debounce
  const searchCounterparties = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCounterparties([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await legacyApi.searchCounterparties({
        q: query,
        limit: 10,
      });
      setCounterparties(result.items);
    } catch (err) {
      console.error('Failed to search counterparties:', err);
      setError('Ошибка поиска');
      setCounterparties([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchCounterparties(search);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search, searchCounterparties]);

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (counterparty: LegacyCounterparty) => {
    setSelectedCounterparty(counterparty);
    onChange(counterparty);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedCounterparty(null);
    onChange(null);
    setSearch('');
  };

  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Выбранный контрагент или кнопка выбора */}
      {selectedCounterparty ? (
        <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded">
              <Building className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedCounterparty.name}
              </p>
              {selectedCounterparty.inn && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ИНН: {selectedCounterparty.inn}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {showLegacyLink && (
              <a
                href={legacyUrls.counterparty(selectedCounterparty.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400"
                title="Открыть в Legacy CRM"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-gray-400 hover:text-red-500"
                title="Очистить"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className="w-full flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <Building className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">{placeholder}</span>
        </button>
      )}

      {/* Выпадающий список поиска */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {/* Поле поиска */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Введите название или ИНН..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-white"
              />
              {isLoading && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-500 animate-spin" />
              )}
            </div>
          </div>

          {/* Результаты поиска */}
          <div className="max-h-60 overflow-y-auto">
            {error && (
              <div className="p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {!error && search.length < 2 && (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Введите минимум 2 символа для поиска
              </div>
            )}

            {!error && search.length >= 2 && !isLoading && counterparties.length === 0 && (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Компании не найдены
              </div>
            )}

            {counterparties.map((counterparty) => (
              <button
                key={counterparty.id}
                type="button"
                onClick={() => handleSelect(counterparty)}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
              >
                <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded">
                  <Building className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {counterparty.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {[
                      counterparty.inn && `ИНН: ${counterparty.inn}`,
                      counterparty.phone,
                      counterparty.email,
                    ]
                      .filter(Boolean)
                      .join(' • ') || 'Нет контактов'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LegacyCounterpartyPicker;
