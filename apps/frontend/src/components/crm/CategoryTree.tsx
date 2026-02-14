'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronDown, FolderOpen, Folder, Package, Search } from 'lucide-react';
import { productCategoriesApi, type CategoryTreeNode } from '@/lib/api/product-categories';

interface CategoryTreeProps {
  workspaceId: string;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: CategoryTreeNode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  const totalCount = useMemo(() => {
    const sum = (n: CategoryTreeNode): number =>
      n.productCount + n.children.reduce((acc, c) => acc + sum(c), 0);
    return sum(node);
  }, [node]);

  return (
    <div>
      <button
        onClick={() => {
          onSelect(isSelected ? null : node.id);
          if (hasChildren && !expanded) setExpanded(true);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer ${
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )}
          </span>
        ) : (
          <span className="w-4.5" />
        )}
        {hasChildren && expanded ? (
          <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
        ) : hasChildren ? (
          <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
        ) : (
          <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <span className="flex-1 truncate text-left">{node.name}</span>
        {totalCount > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{totalCount}</span>
        )}
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTree({ workspaceId, selectedCategoryId, onSelectCategory }: CategoryTreeProps) {
  const [tree, setTree] = useState<CategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    productCategoriesApi.getTree(workspaceId)
      .then(setTree)
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    const filterNodes = (nodes: CategoryTreeNode[]): CategoryTreeNode[] =>
      nodes
        .map((n) => ({
          ...n,
          children: filterNodes(n.children),
        }))
        .filter((n) => n.name.toLowerCase().includes(q) || n.children.length > 0);
    return filterNodes(tree);
  }, [tree, search]);

  const totalProducts = useMemo(() => {
    const sum = (nodes: CategoryTreeNode[]): number =>
      nodes.reduce((acc, n) => acc + n.productCount + sum(n.children), 0);
    return sum(tree);
  }, [tree]);

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (tree.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Категории
        </h3>
      </div>

      {/* Поиск по категориям */}
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти категорию..."
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Все товары */}
      <div className="px-2">
        <button
          onClick={() => onSelectCategory(null)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer ${
            selectedCategoryId === null
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span className="flex-1 text-left">Все товары</span>
          <span className="text-xs text-gray-400 tabular-nums">{totalProducts}</span>
        </button>
      </div>

      {/* Дерево */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filteredTree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            selectedId={selectedCategoryId}
            onSelect={onSelectCategory}
          />
        ))}
      </div>
    </div>
  );
}
