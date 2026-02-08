'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TextareaFieldConfig } from '@/types';
import type { FieldRenderer } from './types';
import { RichTextEditor, RichTextView } from './RichTextEditor';

function TextareaRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const config = field.config as TextareaFieldConfig | undefined;
  const collapsedLines = config?.collapsedLines ?? 3;
  const isMarkdown = config?.markdown ?? false;

  const autoResize = useCallback(() => {
    if (config?.autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [config?.autoResize]);

  useEffect(() => {
    if (isEditing) autoResize();
  }, [isEditing, editValue, autoResize]);

  const handleSave = () => {
    onUpdate(editValue || null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(value ?? '');
      setIsEditing(false);
    }
  };

  // Rich text mode (Tiptap)
  if (isMarkdown) {
    if (!canEdit) {
      return <RichTextView html={value as string} />;
    }

    if (isEditing) {
      return (
        <div>
          <RichTextEditor
            value={editValue}
            onChange={setEditValue}
            placeholder={field.description || 'Введите текст...'}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSave}
              className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              Сохранить
            </button>
            <button
              onClick={() => { setEditValue(value ?? ''); setIsEditing(false); }}
              className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Отмена
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        onClick={() => { setEditValue(value ?? ''); setIsEditing(true); }}
        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1"
      >
        {value ? (
          <RichTextView html={value as string} />
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-sm">Нажмите для ввода...</span>
        )}
      </div>
    );
  }

  // Plain text mode — collapsible view
  const isLong = config?.collapsible && value && (value as string).split('\n').length > collapsedLines;

  if (!canEdit) {
    if (!value) {
      return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
    }

    if (isLong) {
      const lines = (value as string).split('\n');
      const displayText = isCollapsed ? lines.slice(0, collapsedLines).join('\n') : value;
      return (
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{displayText as string}</p>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3 h-3" /> Показать полностью ({lines.length} строк)
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3" /> Свернуть
              </>
            )}
          </button>
        </div>
      );
    }

    return (
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{value as string}</p>
    );
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        rows={config?.autoResize ? 1 : 3}
        className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none overflow-hidden"
        autoFocus
      />
    );
  }

  return (
    <div
      onClick={() => {
        setEditValue(value ?? '');
        setIsEditing(true);
      }}
      className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1"
    >
      {value || <span className="text-gray-400 dark:text-gray-500">Нажмите для ввода...</span>}
    </div>
  );
}

function TextareaForm({ field, value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as TextareaFieldConfig | undefined;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMarkdown = config?.markdown ?? false;

  useEffect(() => {
    if (config?.autoResize && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value, config?.autoResize]);

  if (isMarkdown) {
    return (
      <RichTextEditor
        value={value || ''}
        onChange={onChange}
        placeholder={field.description || 'Введите текст...'}
      />
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.description || ''}
      rows={config?.autoResize ? 1 : 3}
      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none overflow-hidden"
    />
  );
}

function TextareaFilter({ field, filterValue, onChange, inputClass }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  return (
    <div className="mt-2">
      <input
        type="text"
        value={filterValue || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Поиск по "${field.name}"...`}
        className={inputClass}
      />
    </div>
  );
}

export const textareaFieldRenderer: FieldRenderer = {
  Renderer: TextareaRenderer,
  Form: TextareaForm,
  Filter: TextareaFilter,
};
