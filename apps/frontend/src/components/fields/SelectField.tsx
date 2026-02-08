'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import type { SelectFieldConfig, FieldOption } from '@/types';
import type { FieldRenderer } from './types';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280', '#06B6D4'];

// Бейдж для опции
function OptionBadge({ label, color, onRemove }: { label: string; color?: string; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        backgroundColor: color ? `${color}20` : '#f3f4f6',
        color: color || '#374151',
      }}
    >
      {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// Фильтрация опций с учётом cascadeFrom
function useCascadedOptions(field: { options?: FieldOption[]; config?: any }, allData?: Record<string, any>): FieldOption[] {
  const config = field.config as SelectFieldConfig | undefined;
  const options = field.options || [];

  return useMemo(() => {
    if (!config?.cascadeFrom || !allData) return options;
    const parentValue = allData[config.cascadeFrom];
    if (!parentValue) return options;
    return options.filter((o) => o.parentId === parentValue);
  }, [options, config?.cascadeFrom, allData]);
}

function SelectRenderer({ field, value, canEdit, onUpdate, allData }: Parameters<FieldRenderer['Renderer']>[0]) {
  const config = field.config as SelectFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const searchable = config?.searchable ?? false;
  const allowCreate = config?.allowCreate ?? false;
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const cascadedOptions = useCascadedOptions(field, allData);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  if (!field.options) return null;

  const selectedIds: string[] = isMulti
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : [];

  const selectedOption = !isMulti ? cascadedOptions.find((o) => o.id === value) : null;

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return cascadedOptions;
    const lower = searchTerm.toLowerCase();
    return cascadedOptions.filter((o) => o.label.toLowerCase().includes(lower));
  }, [cascadedOptions, searchTerm]);

  const canCreateNew = allowCreate && searchTerm.trim() &&
    !cascadedOptions.some((o) => o.label.toLowerCase() === searchTerm.trim().toLowerCase());

  const handleCreateOption = () => {
    const { currentWorkspace, updateField: wsUpdateField } = useWorkspaceStore.getState();
    if (!currentWorkspace) return;

    const newOpt: FieldOption = {
      id: `opt-${Date.now()}`,
      label: searchTerm.trim(),
      color: PRESET_COLORS[(field.options?.length || 0) % PRESET_COLORS.length],
    };

    for (const section of currentWorkspace.sections) {
      const f = section.fields.find((f) => f.id === field.id);
      if (f) {
        wsUpdateField(section.id, field.id, { options: [...(field.options || []), newOpt] });
        break;
      }
    }

    if (isMulti) {
      onUpdate([...selectedIds, newOpt.id]);
    } else {
      onUpdate(newOpt.id);
      setIsOpen(false);
    }
    setSearchTerm('');
  };

  if (!canEdit) {
    if (isMulti) {
      if (selectedIds.length === 0) {
        return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const opt = field.options?.find((o) => o.id === id);
            if (!opt) return null;
            return <OptionBadge key={id} label={opt.label} color={opt.color} />;
          })}
        </div>
      );
    }

    return selectedOption ? (
      <OptionBadge label={selectedOption.label} color={selectedOption.color} />
    ) : (
      <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
    );
  }

  if (isMulti || searchable || allowCreate) {
    const toggleOption = (optId: string) => {
      if (isMulti) {
        const newIds = selectedIds.includes(optId)
          ? selectedIds.filter((id) => id !== optId)
          : [...selectedIds, optId];
        onUpdate(newIds);
      } else {
        onUpdate(optId);
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    return (
      <div className="relative" ref={dropdownRef}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 cursor-pointer min-h-[32px] flex flex-wrap gap-1 items-center"
        >
          {isMulti && selectedIds.length > 0 ? (
            selectedIds.map((id) => {
              const opt = field.options?.find((o) => o.id === id);
              if (!opt) return null;
              return <OptionBadge key={id} label={opt.label} color={opt.color} onRemove={() => toggleOption(id)} />;
            })
          ) : selectedOption ? (
            <OptionBadge label={selectedOption.label} color={selectedOption.color} />
          ) : (
            <span className="text-gray-400 dark:text-gray-500">Не выбрано</span>
          )}
        </div>

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {(searchable || allowCreate) && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1.5 px-2 py-1 border border-gray-200 dark:border-gray-600 rounded">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Поиск..."
                    className="flex-1 text-sm bg-transparent focus:outline-none dark:text-gray-200"
                    autoFocus
                  />
                </div>
              </div>
            )}
            {!isMulti && (
              <button
                onClick={() => { onUpdate(null); setIsOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Не выбрано
              </button>
            )}
            {filteredOptions.map((opt) => {
              const isSelected = isMulti ? selectedIds.includes(opt.id) : value === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleOption(opt.id)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}
                >
                  {isMulti && (
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  )}
                  {opt.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />}
                  <span className="text-gray-700 dark:text-gray-300">{opt.label}</span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && !canCreateNew && (
              <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Ничего не найдено</div>
            )}
            {canCreateNew && (
              <button
                onClick={handleCreateOption}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 border-t border-gray-200 dark:border-gray-700"
              >
                <Plus className="w-4 h-4" />
                Создать «{searchTerm.trim()}»
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onUpdate(e.target.value || null)}
      className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
    >
      <option value="">Не выбрано</option>
      {cascadedOptions.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function SelectForm({ field, value, onChange, allData }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as SelectFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const cascadedOptions = useCascadedOptions(field, allData);

  if (!field.options) return null;

  if (isMulti) {
    const selectedIds: string[] = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <div className="space-y-1">
        {cascadedOptions.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.includes(opt.id)}
              onChange={() => {
                const newIds = selectedIds.includes(opt.id)
                  ? selectedIds.filter((id) => id !== opt.id)
                  : [...selectedIds, opt.id];
                onChange(newIds);
              }}
              className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
            />
            {opt.color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: opt.color }} />}
            <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <option value="">Не выбрано</option>
      {cascadedOptions.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function SelectFilter({ field, filterValue, toggleMultiSelect, allFilterValues }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  if (!field.options) return null;

  const config = field.config as SelectFieldConfig | undefined;

  // cascadeFrom: фильтрация опций по значению родительского фильтра
  const visibleOptions = useMemo(() => {
    if (!config?.cascadeFrom || !allFilterValues) return field.options || [];
    const parentFilterValue = allFilterValues[config.cascadeFrom];
    // Если родительский фильтр не активен — показываем все
    if (!parentFilterValue || (Array.isArray(parentFilterValue) && parentFilterValue.length === 0)) {
      return field.options || [];
    }
    // Если родительский фильтр = массив (multi-select) — показываем опции для всех выбранных родителей
    const parentIds = Array.isArray(parentFilterValue) ? parentFilterValue : [parentFilterValue];
    return (field.options || []).filter((o) => o.parentId && parentIds.includes(o.parentId));
  }, [field.options, config?.cascadeFrom, allFilterValues]);

  return (
    <div className="mt-2 space-y-1">
      {visibleOptions.map((option) => (
        <label
          key={option.id}
          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={filterValue?.includes(option.id) || false}
            onChange={() => toggleMultiSelect(option.id)}
            className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
          />
          {option.color && (
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }} />
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export const selectFieldRenderer: FieldRenderer = {
  Renderer: SelectRenderer,
  Form: SelectForm,
  Filter: SelectFilter,
};
