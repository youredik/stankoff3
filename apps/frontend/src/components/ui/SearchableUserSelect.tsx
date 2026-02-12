'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

export interface SearchableUserOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

interface SearchableUserSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  users: SearchableUserOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export default function SearchableUserSelect({
  value,
  onChange,
  users,
  placeholder = 'Не назначен',
  emptyLabel = 'Не назначен',
  disabled = false,
  compact = false,
  className = '',
}: SearchableUserSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === value) || null,
    [users, value],
  );

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
      return fullName.includes(q) || (u.email && u.email.toLowerCase().includes(q));
    });
  }, [users, search]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  function handleSelect(userId: string | null) {
    onChange(userId);
    setIsOpen(false);
    setSearch('');
  }

  const baseButton = compact
    ? 'text-xs border rounded-lg px-2 py-1 max-w-[160px]'
    : 'w-full border rounded px-3 py-2 text-sm';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`${baseButton} flex items-center justify-between gap-1 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="truncate">
          {selectedUser
            ? `${selectedUser.firstName} ${selectedUser.lastName}`
            : emptyLabel}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="w-full pl-8 pr-7 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-900 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
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
            {/* Empty option */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                !value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {placeholder}
            </button>

            {filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelect(u.id)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  value === u.id
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                    : 'text-gray-900 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {u.firstName} {u.lastName}
              </button>
            ))}

            {filteredUsers.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">
                Не найдено
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
