'use client';

import { useDraggable } from '@dnd-kit/core';
import {
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
import type { FieldType } from '@/types';

interface FieldTypeConfig {
  type: FieldType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const FIELD_TYPES: FieldTypeConfig[] = [
  {
    type: 'text',
    label: 'Текст',
    icon: <Type className="w-4 h-4" />,
    description: 'Однострочный текст',
  },
  {
    type: 'textarea',
    label: 'Многострочный',
    icon: <AlignLeft className="w-4 h-4" />,
    description: 'Многострочный текст',
  },
  {
    type: 'number',
    label: 'Число',
    icon: <Hash className="w-4 h-4" />,
    description: 'Числовое значение',
  },
  {
    type: 'date',
    label: 'Дата',
    icon: <Calendar className="w-4 h-4" />,
    description: 'Дата или дата+время',
  },
  {
    type: 'select',
    label: 'Выбор',
    icon: <List className="w-4 h-4" />,
    description: 'Выбор из списка',
  },
  {
    type: 'status',
    label: 'Статус',
    icon: <CircleDot className="w-4 h-4" />,
    description: 'Статус (колонки канбана)',
  },
  {
    type: 'user',
    label: 'Пользователь',
    icon: <User className="w-4 h-4" />,
    description: 'Выбор сотрудника',
  },
  {
    type: 'file',
    label: 'Файл',
    icon: <Paperclip className="w-4 h-4" />,
    description: 'Вложение файла',
  },
  {
    type: 'relation',
    label: 'Связь',
    icon: <Link2 className="w-4 h-4" />,
    description: 'Связь с другой сущностью',
  },
];

interface DraggableFieldTypeProps {
  config: FieldTypeConfig;
}

function DraggableFieldType({ config }: DraggableFieldTypeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${config.type}`,
    data: {
      type: 'new-field',
      fieldType: config.type,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-grab hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-400">
        {config.icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{config.label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{config.description}</p>
      </div>
    </div>
  );
}

export function FieldPalette() {
  return (
    <div className="w-64 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase mb-4">
        Типы полей
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Перетащите поле в секцию для добавления
      </p>
      <div className="space-y-2">
        {FIELD_TYPES.map((config) => (
          <DraggableFieldType key={config.type} config={config} />
        ))}
      </div>
    </div>
  );
}

export { FIELD_TYPES };
