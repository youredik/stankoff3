'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Eye, EyeOff, GripVertical, RotateCcw, Search } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ResolvedColumn } from '@/hooks/useTableColumns';

interface ColumnSettingsPanelProps {
  columns: ResolvedColumn[];
  onToggleVisibility: (fieldId: string) => void;
  onReorder: (orderedFieldIds: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}

function SortableColumnItem({
  column,
  onToggle,
}: {
  column: ResolvedColumn;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        aria-label="Перетащить"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <button
        onClick={onToggle}
        className="p-0.5 transition-colors"
        aria-label={column.visible ? 'Скрыть колонку' : 'Показать колонку'}
      >
        {column.visible ? (
          <Eye className="w-4 h-4 text-primary-500" />
        ) : (
          <EyeOff className="w-4 h-4 text-gray-400" />
        )}
      </button>
      <span
        className={`text-sm flex-1 truncate ${
          column.visible
            ? 'text-gray-700 dark:text-gray-300'
            : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {column.label}
      </span>
      {column.isSystem && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded flex-shrink-0">
          системное
        </span>
      )}
    </div>
  );
}

export function ColumnSettingsPanel({
  columns,
  onToggleVisibility,
  onReorder,
  onReset,
  onClose,
}: ColumnSettingsPanelProps) {
  const [search, setSearch] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sorted = useMemo(
    () => [...columns].sort((a, b) => a.order - b.order),
    [columns],
  );

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((c) => c.label.toLowerCase().includes(q));
  }, [sorted, search]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sorted.findIndex((c) => c.fieldId === active.id);
      const newIndex = sorted.findIndex((c) => c.fieldId === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sorted, oldIndex, newIndex);
      onReorder(reordered.map((c) => c.fieldId));
    },
    [sorted, onReorder],
  );

  // Escape закрывает
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Настройка колонок
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {visibleCount} из {columns.length} видимых
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onReset}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              title="Сбросить к настройкам по умолчанию"
              aria-label="Сбросить настройки"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        {columns.length > 8 && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск колонок..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        )}

        {/* Column list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filtered.map((c) => c.fieldId)}
              strategy={verticalListSortingStrategy}
            >
              {filtered.map((col) => (
                <SortableColumnItem
                  key={col.fieldId}
                  column={col}
                  onToggle={() => onToggleVisibility(col.fieldId)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </>
  );
}
