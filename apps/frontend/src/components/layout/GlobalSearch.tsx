'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Command, X } from 'lucide-react';
import { entitiesApi, SearchResult } from '@/lib/api/entities';
import { SkeletonSearchResult } from '@/components/ui/Skeleton';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useEntityStore } from '@/store/useEntityStore';

export function GlobalSearch() {
  const router = useRouter();
  const { setCurrentWorkspace, workspaces, fetchWorkspace } = useWorkspaceStore();
  const { selectEntity } = useEntityStore();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await entitiesApi.search(query);
        setResults(data);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Navigate results with keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    },
    [results, selectedIndex]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const item = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results.length]);

  const handleSelect = async (result: SearchResult) => {
    setIsOpen(false);
    setQuery('');
    setResults([]);

    // Переходим к workspace и открываем entity
    await fetchWorkspace(result.workspaceId);
    router.push('/dashboard');

    // Небольшая задержка, чтобы store обновился
    setTimeout(() => {
      selectEntity(result.id);
    }, 100);
  };

  const close = () => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300';
      case 'low':
        return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  };

  const getPriorityLabel = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'Высокий';
      case 'medium':
        return 'Средний';
      case 'low':
        return 'Низкий';
      default:
        return '';
    }
  };

  return (
    <>
      {/* Trigger */}
      <div className="flex-1 max-w-xl">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full relative group"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
            <div className="w-full pl-10 pr-20 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-left text-gray-400 dark:text-gray-500 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              Поиск по заявкам...
            </div>
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-xs text-gray-400 dark:text-gray-500">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          </div>
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={close}
          />
          <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Глобальный поиск"
              className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <Search className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Поиск по номеру или названию заявки..."
                  className="flex-1 text-base outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                <button
                  onClick={close}
                  aria-label="Закрыть поиск"
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </button>
              </div>

              {/* Results */}
              <div ref={resultsRef} className="max-h-[400px] overflow-y-auto" role="listbox" aria-label="Результаты поиска">
                {query.length < 2 ? (
                  <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    Введите минимум 2 символа для поиска
                  </div>
                ) : loading ? (
                  <div className="p-2 space-y-1">
                    <SkeletonSearchResult />
                    <SkeletonSearchResult />
                    <SkeletonSearchResult />
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    Ничего не найдено
                  </div>
                ) : (
                  results.map((result, index) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                        index === selectedIndex
                          ? 'bg-primary-50 dark:bg-primary-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {/* Workspace icon */}
                      <div className="w-8 h-8 flex items-center justify-center text-lg bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0">
                        {result.workspaceIcon || '📋'}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                            {result.customId}
                          </span>
                          {result.priority && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${getPriorityColor(
                                result.priority
                              )}`}
                            >
                              {getPriorityLabel(result.priority)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {result.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {result.workspaceName}
                          {result.assignee && (
                            <span>
                              {' • '}
                              {result.assignee.firstName} {result.assignee.lastName}
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              {results.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">↑↓</kbd>
                    навигация
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">Enter</kbd>
                    открыть
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">Esc</kbd>
                    закрыть
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
