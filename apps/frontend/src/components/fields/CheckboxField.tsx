'use client';

import { Check, X as XIcon } from 'lucide-react';
import type { FieldRenderer } from './types';

function CheckboxRenderer({ value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const isChecked = Boolean(value);

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2">
        {isChecked ? (
          <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
            <XIcon className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {isChecked ? 'Да' : 'Нет'}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onUpdate(!isChecked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      style={{ backgroundColor: isChecked ? '#10B981' : '#D1D5DB' }}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isChecked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function CheckboxForm({ value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const isChecked = Boolean(value);
  return (
    <button
      type="button"
      onClick={() => onChange(!isChecked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      style={{ backgroundColor: isChecked ? '#10B981' : '#D1D5DB' }}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isChecked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function CheckboxFilter({ filterValue, onChange, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  const facet = facetData as import('@/types').CheckboxFacet | undefined;

  const options: { value: null | boolean; label: string; count?: number }[] = [
    { value: null, label: 'Все', count: facet ? facet.total : undefined },
    { value: true, label: 'Да', count: facet?.trueCount },
    { value: false, label: 'Нет', count: facet?.falseCount },
  ];

  return (
    <div className="mt-2 space-y-1">
      {options.map((option) => (
        <label
          key={String(option.value)}
          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        >
          <input
            type="radio"
            name="checkbox-filter"
            checked={filterValue === option.value}
            onChange={() => onChange(option.value)}
            className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
            {option.label}
          </span>
          {option.count != null && (
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{option.count}</span>
          )}
        </label>
      ))}
    </div>
  );
}

export const checkboxFieldRenderer: FieldRenderer = {
  Renderer: CheckboxRenderer,
  Form: CheckboxForm,
  Filter: CheckboxFilter,
};
