'use client';

import { useState } from 'react';
import type { TextFieldConfig } from '@/types';
import type { FieldRenderer } from './types';

// Маски: phone и inn
const MASKS: Record<string, { pattern: RegExp; format: (v: string) => string; placeholder: string }> = {
  phone: {
    pattern: /[\d+\-() ]/g,
    format: (v: string) => {
      const digits = v.replace(/\D/g, '');
      if (digits.length <= 1) return '+' + digits;
      if (digits.length <= 4) return `+${digits[0]} (${digits.slice(1)}`;
      if (digits.length <= 7) return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4)}`;
      if (digits.length <= 9) return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
      return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
    },
    placeholder: '+7 (___) ___-__-__',
  },
  inn: {
    pattern: /\d/g,
    format: (v: string) => v.replace(/\D/g, '').slice(0, 12),
    placeholder: 'ИНН (10 или 12 цифр)',
  },
};

function TextRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');
  const config = field.config as TextFieldConfig | undefined;

  const handleSave = () => {
    const trimmed = config?.trim !== false ? (editValue as string).trim() : editValue;
    onUpdate(trimmed || null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditValue(value ?? '');
      setIsEditing(false);
    }
  };

  const handleChange = (raw: string) => {
    const mask = config?.mask ? MASKS[config.mask] : undefined;
    if (mask) {
      setEditValue(mask.format(raw));
    } else if (config?.maxLength) {
      setEditValue(raw.slice(0, config.maxLength));
    } else {
      setEditValue(raw);
    }
  };

  if (!canEdit) {
    return value ? (
      <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>
    ) : (
      <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
    );
  }

  if (isEditing) {
    const mask = config?.mask ? MASKS[config.mask] : undefined;
    return (
      <div>
        <input
          type="text"
          value={editValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          maxLength={config?.maxLength}
          placeholder={mask?.placeholder || field.description || ''}
          className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        />
        {config?.maxLength && (
          <div className="text-right text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {(editValue as string).length}/{config.maxLength}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        setEditValue(value ?? '');
        setIsEditing(true);
      }}
      className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1 min-h-[28px] flex items-center"
    >
      {value || <span className="text-gray-400 dark:text-gray-500">Нажмите для ввода...</span>}
    </div>
  );
}

function TextForm({ field, value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as TextFieldConfig | undefined;
  const mask = config?.mask ? MASKS[config.mask] : undefined;

  const handleChange = (raw: string) => {
    if (mask) {
      onChange(mask.format(raw));
    } else if (config?.maxLength) {
      onChange(raw.slice(0, config.maxLength));
    } else {
      onChange(raw);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        maxLength={config?.maxLength}
        placeholder={mask?.placeholder || field.description || ''}
        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {config?.maxLength && (
        <div className="text-right text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {((value as string) || '').length}/{config.maxLength}
        </div>
      )}
    </div>
  );
}

function TextFilter({ field, filterValue, onChange, inputClass, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  const facet = facetData as import('@/types').TextFacet | undefined;
  const listId = `text-facet-${field.id}`;

  return (
    <div className="mt-2">
      {facet && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          {facet.count} уник. значений
        </div>
      )}
      <input
        type="text"
        value={filterValue || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Поиск по "${field.name}"...`}
        className={inputClass}
        list={facet?.values?.length ? listId : undefined}
      />
      {facet?.values?.length ? (
        <datalist id={listId}>
          {facet.values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

export const textFieldRenderer: FieldRenderer = {
  Renderer: TextRenderer,
  Form: TextForm,
  Filter: TextFilter,
};
