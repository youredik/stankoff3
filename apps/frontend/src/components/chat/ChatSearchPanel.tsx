'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { chatApi } from '@/lib/api/chat';
import type { ChatMessage } from '@/types';
import { format } from 'date-fns';

interface ChatSearchPanelProps {
  conversationId: string;
  onClose: () => void;
}

export function ChatSearchPanel({ conversationId, onClose }: ChatSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const all = await chatApi.searchMessages(q);
      // Filter to current conversation
      const filtered = all.filter(m => m.conversationId === conversationId);
      setResults(filtered);
      setSelectedIndex(0);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }, [doSearch]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary-500', 'ring-offset-1');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-1'), 2000);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter' && results.length > 0) {
      scrollToMessage(results[selectedIndex].id);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    }
  }, [results, selectedIndex, scrollToMessage, onClose]);

  return (
    <div data-testid="chat-search-panel" className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          data-testid="chat-search-input"
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Поиск по сообщениям..."
          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400"
        />
        {results.length > 0 && (
          <span data-testid="chat-search-count" className="text-xs text-gray-400 flex-shrink-0">
            {selectedIndex + 1}/{results.length}
          </span>
        )}
        {results.length > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              data-testid="chat-search-up"
              onClick={() => {
                const idx = Math.max(selectedIndex - 1, 0);
                setSelectedIndex(idx);
                scrollToMessage(results[idx].id);
              }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              data-testid="chat-search-down"
              onClick={() => {
                const idx = Math.min(selectedIndex + 1, results.length - 1);
                setSelectedIndex(idx);
                scrollToMessage(results[idx].id);
              }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <button
          data-testid="chat-search-close"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results dropdown */}
      {results.length > 0 && (
        <div data-testid="chat-search-results" className="mt-2 max-h-[200px] overflow-y-auto space-y-1">
          {results.map((msg, i) => (
            <button
              key={msg.id}
              data-testid="chat-search-result"
              onClick={() => { setSelectedIndex(i); scrollToMessage(msg.id); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                i === selectedIndex
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {msg.author?.firstName} {msg.author?.lastName}
                </span>
                <span className="text-gray-400">
                  {format(new Date(msg.createdAt), 'dd.MM.yy HH:mm')}
                </span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 truncate">
                {(msg.content || '').replace(/<[^>]*>/g, '')}
              </p>
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-xs text-gray-400 mt-1">Поиск...</p>}
      {!loading && query.trim() && results.length === 0 && (
        <p data-testid="chat-search-empty" className="text-xs text-gray-400 mt-1">Ничего не найдено</p>
      )}
    </div>
  );
}
