'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { CategoryTree } from './CategoryTree';

const TableView = dynamic(
  () => import('@/components/table/TableView').then((m) => m.TableView),
  { ssr: false },
);

interface ProductCatalogViewProps {
  workspaceId: string;
}

export function ProductCatalogView({ workspaceId }: ProductCatalogViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const handleSelectCategory = useCallback((categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
  }, []);

  return (
    <div className="flex h-full gap-0">
      {/* Дерево категорий — левая панель */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
        <CategoryTree
          workspaceId={workspaceId}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
        />
      </div>

      {/* Таблица товаров — основная область */}
      <div className="flex-1 min-w-0">
        <TableView
          workspaceId={workspaceId}
          categoryId={selectedCategoryId ?? undefined}
        />
      </div>
    </div>
  );
}
