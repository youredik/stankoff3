'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Package, Loader2, ExternalLink, CheckCircle } from 'lucide-react';
import { legacyApi, legacyUrls } from '@/lib/api/legacy';
import type { LegacyProduct, LegacyCategory } from '@/types/legacy';

interface LegacyProductPickerProps {
  /** Выбранный товар (ID) */
  value?: number | null;
  /** Callback при выборе товара */
  onChange: (product: LegacyProduct | null) => void;
  /** Placeholder для поля поиска */
  placeholder?: string;
  /** Фильтр по категории */
  categoryId?: number;
  /** Показывать только товары в наличии */
  inStockOnly?: boolean;
  /** Отключить компонент */
  disabled?: boolean;
  /** CSS класс для контейнера */
  className?: string;
  /** Показывать ссылку на Legacy CRM */
  showLegacyLink?: boolean;
  /** Показывать фильтр категорий */
  showCategoryFilter?: boolean;
}

/**
 * Компонент выбора товара из Legacy CRM
 *
 * Использование:
 * ```tsx
 * <LegacyProductPicker
 *   value={productId}
 *   onChange={(product) => setProductId(product?.id ?? null)}
 *   placeholder="Выберите товар"
 *   inStockOnly
 * />
 * ```
 */
export function LegacyProductPicker({
  value,
  onChange,
  placeholder = 'Поиск товара...',
  categoryId: initialCategoryId,
  inStockOnly = false,
  disabled = false,
  className = '',
  showLegacyLink = true,
  showCategoryFilter = true,
}: LegacyProductPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<LegacyProduct[]>([]);
  const [categories, setCategories] = useState<LegacyCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(initialCategoryId);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LegacyProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Загружаем категории при первом открытии
  useEffect(() => {
    if (isOpen && categories.length === 0 && showCategoryFilter) {
      legacyApi.getCategories()
        .then(setCategories)
        .catch((err) => console.error('Failed to load categories:', err));
    }
  }, [isOpen, categories.length, showCategoryFilter]);

  // Загружаем выбранный товар по ID при инициализации
  useEffect(() => {
    if (value && !selectedProduct) {
      legacyApi.getProduct(value)
        .then(setSelectedProduct)
        .catch(() => setSelectedProduct(null));
    } else if (!value) {
      setSelectedProduct(null);
    }
  }, [value, selectedProduct]);

  // Поиск товаров с debounce
  const searchProducts = useCallback(async (query: string, catId?: number) => {
    if (query.length < 2 && !catId) {
      setProducts([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await legacyApi.searchProducts({
        q: query || undefined,
        limit: 15,
        categoryId: catId,
        inStockOnly,
      });
      setProducts(result.items);
    } catch (err) {
      console.error('Failed to search products:', err);
      setError('Ошибка поиска');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [inStockOnly]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchProducts(search, selectedCategoryId);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search, selectedCategoryId, searchProducts]);

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

  const handleSelect = (product: LegacyProduct) => {
    setSelectedProduct(product);
    onChange(product);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedProduct(null);
    onChange(null);
    setSearch('');
  };

  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Выбранный товар или кнопка выбора */}
      {selectedProduct ? (
        <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded">
              <Package className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedProduct.name}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatPrice(selectedProduct.price)}</span>
                {selectedProduct.productCode && (
                  <>
                    <span>•</span>
                    <span className="truncate">{selectedProduct.productCode}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {selectedProduct.isInStock && (
              <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                В наличии
              </span>
            )}
            {showLegacyLink && (
              <a
                href={legacyUrls.product(selectedProduct.uri, selectedProduct.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400"
                title="Открыть в каталоге"
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
          <Package className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">{placeholder}</span>
        </button>
      )}

      {/* Выпадающий список поиска */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {/* Поле поиска */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Введите название или артикул..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-white"
              />
              {isLoading && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-500 animate-spin" />
              )}
            </div>

            {/* Фильтр категорий */}
            {showCategoryFilter && categories.length > 0 && (
              <select
                value={selectedCategoryId ?? ''}
                onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-white"
              >
                <option value="">Все категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Результаты поиска */}
          <div className="max-h-60 overflow-y-auto">
            {error && (
              <div className="p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {!error && search.length < 2 && !selectedCategoryId && (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Введите минимум 2 символа или выберите категорию
              </div>
            )}

            {!error && (search.length >= 2 || selectedCategoryId) && !isLoading && products.length === 0 && (
              <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                Товары не найдены
              </div>
            )}

            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
              >
                <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded">
                  <Package className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {product.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium">{formatPrice(product.price)}</span>
                    {product.productCode && (
                      <>
                        <span>•</span>
                        <span className="truncate">{product.productCode}</span>
                      </>
                    )}
                    {product.categoryName && (
                      <>
                        <span>•</span>
                        <span className="truncate">{product.categoryName}</span>
                      </>
                    )}
                  </div>
                </div>
                {product.isInStock ? (
                  <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded shrink-0">
                    В наличии
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded shrink-0">
                    Под заказ
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

export default LegacyProductPicker;
