'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Settings,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  List,
  CircleDot,
  User,
  Paperclip,
  Link2,
} from 'lucide-react';
import type { Field, FieldType } from '@/types';

interface FieldCardProps {
  field: Field;
  sectionId: string;
  onEdit: () => void;
  onRemove: () => void;
}

const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
  text: <Type className="w-4 h-4" />,
  textarea: <AlignLeft className="w-4 h-4" />,
  number: <Hash className="w-4 h-4" />,
  date: <Calendar className="w-4 h-4" />,
  select: <List className="w-4 h-4" />,
  status: <CircleDot className="w-4 h-4" />,
  user: <User className="w-4 h-4" />,
  file: <Paperclip className="w-4 h-4" />,
  relation: <Link2 className="w-4 h-4" />,
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  textarea: 'Многострочный',
  number: 'Число',
  date: 'Дата',
  select: 'Выбор',
  status: 'Статус',
  user: 'Пользователь',
  file: 'Файл',
  relation: 'Связь',
};

export function FieldCard({
  field,
  sectionId,
  onEdit,
  onRemove,
}: FieldCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${sectionId}::${field.id}`,
    data: {
      type: 'field',
      field,
      sectionId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSystemField = ['title', 'status'].includes(field.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg group hover:border-gray-300"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 cursor-grab"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
        {FIELD_ICONS[field.type]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {field.name}
          </span>
          {field.required && (
            <span className="text-xs text-red-500">*</span>
          )}
          {isSystemField && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              Системное
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{FIELD_TYPE_LABELS[field.type]}</span>
          {field.options && field.options.length > 0 && (
            <span className="text-gray-400">
              ({field.options.length} вариантов)
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="Настроить"
        >
          <Settings className="w-4 h-4" />
        </button>
        {!isSystemField && (
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Удалить"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
