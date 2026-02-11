'use client';

import { useState } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useKnowledgeBaseStore } from '@/store/useKnowledgeBaseStore';
import { KnowledgeArticleCard } from './KnowledgeArticleCard';

export function KnowledgeBaseList() {
  const {
    articles,
    total,
    page,
    totalPages,
    isLoading,
    categories,
    filters,
    setFilters,
    fetchArticles,
  } = useKnowledgeBaseStore();

  const [searchInput, setSearchInput] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ search: searchInput || undefined });
  };

  const handleCategoryChange = (category: string) => {
    setFilters({ category: category || undefined });
  };

  const clearFilters = () => {
    setSearchInput('');
    setFilters({ search: undefined, category: undefined });
  };

  const hasActiveFilters = filters.search || filters.category;

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <div className="flex gap-3 items-center">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по названию или тегам..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </form>

        <select
          value={filters.category || ''}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        >
          <option value="">Все категории</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
            Сбросить
          </button>
        )}
      </div>

      {/* Список */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-r-transparent" />
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400">
            {hasActiveFilters
              ? 'Статьи не найдены. Попробуйте изменить фильтры.'
              : 'Статей пока нет. Создайте первую!'}
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Найдено: {total}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {articles.map((article) => (
              <KnowledgeArticleCard key={article.id} article={article} />
            ))}
          </div>
        </>
      )}

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => fetchArticles(page - 1)}
            disabled={page === 1}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400 px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => fetchArticles(page + 1)}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
