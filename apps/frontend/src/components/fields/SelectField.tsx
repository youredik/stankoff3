'use client';

import { useState, useMemo, useCallback } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { SelectFieldConfig, FieldOption } from '@/types';
import type { FieldRenderer } from './types';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useFilterableList } from '@/hooks/useFilterableList';
import SearchableSelect from '@/components/ui/SearchableSelect';

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

const getOptionSearchText = (opt: FieldOption) => opt.label;

const renderSelectOption = (opt: FieldOption) => (
  <span className="flex items-center gap-2">
    {opt.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />}
    <span>{opt.label}</span>
  </span>
);

function SelectRenderer({ field, value, canEdit, onUpdate, allData }: Parameters<FieldRenderer['Renderer']>[0]) {
  const config = field.config as SelectFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const allowCreate = config?.allowCreate ?? false;

  const cascadedOptions = useCascadedOptions(field, allData);

  if (!field.options) return null;

  const selectedIds: string[] = isMulti
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : [];

  const selectedOption = !isMulti ? cascadedOptions.find((o) => o.id === value) : null;

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

  const handleCreateOption = (searchTerm: string) => {
    const { currentWorkspace, updateField: wsUpdateField } = useWorkspaceStore.getState();
    if (!currentWorkspace) return;

    const newOpt: FieldOption = {
      id: `opt-${Date.now()}`,
      label: searchTerm,
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
    }
  };

  return (
    <SearchableSelect
      options={cascadedOptions}
      value={isMulti ? selectedIds : (value || null)}
      onChange={(v) => onUpdate(v)}
      multi={isMulti}
      getSearchText={getOptionSearchText}
      renderOption={renderSelectOption}
      renderSelectedSingle={(opt) => <OptionBadge label={opt.label} color={opt.color} />}
      renderSelectedMultiTag={(opt, onRemove) => <OptionBadge label={opt.label} color={opt.color} onRemove={onRemove} />}
      allowCreate={allowCreate}
      onCreateOption={handleCreateOption}
      emptyLabel="Не выбрано"
      placeholder="Не выбрано"
    />
  );
}

function SelectForm({ field, value, onChange, allData }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as SelectFieldConfig | undefined;
  const isMulti = config?.multiSelect ?? false;
  const cascadedOptions = useCascadedOptions(field, allData);

  if (!field.options) return null;

  return (
    <SearchableSelect
      options={cascadedOptions}
      value={isMulti ? (Array.isArray(value) ? value : value ? [value] : []) : (value || null)}
      onChange={(v) => onChange(v)}
      multi={isMulti}
      getSearchText={getOptionSearchText}
      renderOption={renderSelectOption}
      renderSelectedSingle={(opt) => <OptionBadge label={opt.label} color={opt.color} />}
      renderSelectedMultiTag={(opt, onRemove) => <OptionBadge label={opt.label} color={opt.color} onRemove={onRemove} />}
      emptyLabel="Не выбрано"
      placeholder="Не выбрано"
      showEmptyOption={!isMulti}
    />
  );
}

function SelectFilter({ field, filterValue, toggleMultiSelect, allFilterValues, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  if (!field.options) return null;

  const config = field.config as SelectFieldConfig | undefined;
  const facet = facetData as import('@/types').SelectFacet | undefined;

  const countMap = useMemo(() => {
    if (!facet?.values) return new Map<string, number>();
    return new Map(facet.values.map((v) => [v.value, v.count]));
  }, [facet]);

  // cascadeFrom: фильтрация опций по значению родительского фильтра
  const visibleOptions = useMemo(() => {
    if (!config?.cascadeFrom || !allFilterValues) return field.options || [];
    const parentFilterValue = allFilterValues[config.cascadeFrom];
    if (!parentFilterValue || (Array.isArray(parentFilterValue) && parentFilterValue.length === 0)) {
      return field.options || [];
    }
    const parentIds = Array.isArray(parentFilterValue) ? parentFilterValue : [parentFilterValue];
    return (field.options || []).filter((o) => o.parentId && parentIds.includes(o.parentId));
  }, [field.options, config?.cascadeFrom, allFilterValues]);

  const selectedIds = useMemo(() => filterValue || [], [filterValue]);
  const getOptionSearch = useCallback((o: FieldOption) => o.label, []);
  const getOptionId = useCallback((o: FieldOption) => o.id, []);

  const list = useFilterableList({
    items: visibleOptions,
    selectedIds,
    getSearchText: getOptionSearch,
    getId: getOptionId,
  });

  const renderOption = (option: FieldOption, checked: boolean) => {
    const count = countMap.get(option.id);
    const isDisabled = !checked && facet && count === undefined;

    return (
      <label
        key={option.id}
        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
          isDisabled ? 'opacity-40 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleMultiSelect(option.id)}
          disabled={!!isDisabled}
          className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
        />
        {option.color && (
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color }} />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{option.label}</span>
        {count != null && (
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
        )}
      </label>
    );
  };

  return (
    <div className="mt-2">
      {list.needsControls && (
        <input
          type="text"
          value={list.searchQuery}
          onChange={(e) => list.setSearchQuery(e.target.value)}
          placeholder="Поиск..."
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
        />
      )}
      <div className="space-y-1">
        {list.selectedItems.map((o) => renderOption(o, true))}
        {list.selectedItems.length > 0 && list.unselectedItems.length > 0 && (
          <div className="border-t border-dashed border-gray-200 dark:border-gray-700 my-1" />
        )}
        {list.unselectedItems.map((o) => renderOption(o, false))}
        {list.needsControls && !list.searchQuery && (
          list.hasMore ? (
            <button
              onClick={list.toggleShowAll}
              className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer py-1 px-2"
            >
              <ChevronDown className="w-3 h-3" />
              <span>Ещё {list.hiddenCount}</span>
            </button>
          ) : list.showAll ? (
            <button
              onClick={list.toggleShowAll}
              className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer py-1 px-2"
            >
              <ChevronDown className="w-3 h-3 rotate-180" />
              <span>Свернуть</span>
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}

export const selectFieldRenderer: FieldRenderer = {
  Renderer: SelectRenderer,
  Form: SelectForm,
  Filter: SelectFilter,
};
