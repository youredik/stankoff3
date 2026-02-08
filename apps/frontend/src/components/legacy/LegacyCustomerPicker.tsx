'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, Building2, Loader2, ExternalLink } from 'lucide-react';
import { legacyApi, legacyUrls } from '@/lib/api/legacy';
import type { LegacyCustomer } from '@/types/legacy';

interface LegacyCustomerPickerProps {
  /** Выбранный клиент (ID) */
  value?: number | null;
  /** Callback при выборе клиента */
  onChange: (customer: LegacyCustomer | null) => void;
  /** Placeholder для поля поиска */
  placeholder?: string;
  /** Показывать только сотрудников */
  employeesOnly?: boolean;
  /** Отключить компонент */
  disabled?: boolean;
  /** CSS класс для контейнера */
  className?: string;
  /** Показывать ссылку на Legacy CRM */
  showLegacyLink?: boolean;
}

/**
 * Компонент выбора клиента из Legacy CRM
 *
 * Использование:
 * ```tsx
 * <LegacyCustomerPicker
 *   value={customerId}
 *   onChange={(customer) => setCustomerId(customer?.id ?? null)}
 *   placeholder="Выберите клиента"
 * />
 * ```
 */
export function LegacyCustomerPicker({
  value,
  onChange,
  placeholder = 'Поиск клиента...',
  employeesOnly = false,
  disabled = false,
  className = '',
  showLegacyLink = true,
}: LegacyCustomerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<LegacyCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<LegacyCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Загружаем выбранного клиента по ID при инициализации
  useEffect(() => {
    if (value && !selectedCustomer) {
      legacyApi.getCustomer(value)
        .then(setSelectedCustomer)
        .catch(() => setSelectedCustomer(null));
    } else if (!value) {
      setSelectedCustomer(null);
    }
  }, [value, selectedCustomer]);

  // Поиск клиентов с debounce
  const searchCustomers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCustomers([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await legacyApi.searchCustomers({
        q: query,
        limit: 10,
        employeesOnly,
      });
      setCustomers(result.items);
    } catch (err) {
      console.error('Failed to search customers:', err);
      setError('Ошибка поиска');
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [employeesOnly]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchCustomers(search);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search, searchCustomers]);

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

  const handleSelect = (customer: LegacyCustomer) => {
    setSelectedCustomer(customer);
    onChange(customer);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedCustomer(null);
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
      {/* Выбранный клиент или кнопка выбора */}
      {selectedCustomer ? (
        <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-1.5 bg-teal-100 dark:bg-teal-900/30 rounded">
              {selectedCustomer.isEmployee ? (
                <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              ) : (
                <User className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedCustomer.displayName}
              </p>
              {(selectedCustomer.email || selectedCustomer.phone) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {selectedCustomer.email || selectedCustomer.phone}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {showLegacyLink && (
              <a
                href={legacyUrls.customer(selectedCustomer.id)}
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
          <Search className="w-4 h-4 text-gray-400" />
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
                placeholder="Введите имя или email..."
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

            {!error && search.length >= 2 && !isLoading && customers.length === 0 && (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Клиенты не найдены
              </div>
            )}

            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelect(customer)}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
              >
                <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded">
                  {customer.isEmployee ? (
                    <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {customer.displayName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {[customer.email, customer.phone].filter(Boolean).join(' • ') || 'Нет контактов'}
                  </p>
                </div>
                {customer.isEmployee && (
                  <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                    Сотрудник
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LegacyCustomerPicker;
