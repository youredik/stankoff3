'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { CategoryTree } from './CategoryTree';

const TableView = dynamic(
  () => import('@/components/table/TableView').then((m) => m.TableView),
  { ssr: false },
);

const STORAGE_KEY = 'stankoff-category-panel-width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

function getInitialWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const n = parseInt(saved, 10);
    if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
  }
  return DEFAULT_WIDTH;
}

interface ProductCatalogViewProps {
  workspaceId: string;
}

export function ProductCatalogView({ workspaceId }: ProductCatalogViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPanelWidth(getInitialWidth());
  }, []);

  const handleSelectCategory = useCallback((categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - rect.left));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setPanelWidth((w) => {
        localStorage.setItem(STORAGE_KEY, String(w));
        return w;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Дерево категорий — левая панель (resizable) */}
      <div
        className="flex-shrink-0 bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden relative"
        style={{ width: panelWidth }}
      >
        <CategoryTree
          workspaceId={workspaceId}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
        />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`group relative flex-shrink-0 w-px cursor-col-resize transition-all ${
          isDragging
            ? 'w-1 bg-primary-500/50'
            : 'bg-gray-200 dark:bg-gray-800 hover:w-1 hover:bg-primary-500/30'
        }`}
      >
        {/* Wider invisible hit area */}
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        {/* Grip indicator — 3 dots in center */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 transition-opacity ${
            isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
          <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
        </div>
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
