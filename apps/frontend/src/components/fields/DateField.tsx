'use client';

import { format, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DateFieldConfig } from '@/types';
import type { FieldRenderer } from './types';

function DateRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const config = field.config as DateFieldConfig | undefined;
  const includeTime = config?.includeTime ?? false;

  if (!canEdit) {
    if (!value) {
      return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
    }
    const dateFormat = includeTime ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy';
    return (
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {format(new Date(value), dateFormat, { locale: ru })}
      </span>
    );
  }

  const inputType = includeTime ? 'datetime-local' : 'date';

  return (
    <div>
      <input
        type={inputType}
        value={value || ''}
        onChange={(e) => onUpdate(e.target.value || null)}
        className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      {config?.quickPicks && (
        <div className="flex gap-1 mt-1.5">
          <button
            type="button"
            onClick={() => onUpdate(format(new Date(), includeTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'))}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => onUpdate(format(addDays(new Date(), 1), includeTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'))}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Завтра
          </button>
          <button
            type="button"
            onClick={() => onUpdate(format(addDays(new Date(), 7), includeTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'))}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            +1 нед
          </button>
        </div>
      )}
    </div>
  );
}

function DateForm({ field, value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as DateFieldConfig | undefined;
  const includeTime = config?.includeTime ?? false;
  const inputType = includeTime ? 'datetime-local' : 'date';

  return (
    <div>
      <input
        type={inputType}
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {config?.quickPicks && (
        <div className="flex gap-1 mt-1.5">
          <button
            type="button"
            onClick={() => onChange(format(new Date(), includeTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'))}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => onChange(format(addDays(new Date(), 1), includeTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'))}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Завтра
          </button>
          <button
            type="button"
            onClick={() => onChange(format(addDays(new Date(), 7), includeTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'))}
            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            +1 нед
          </button>
        </div>
      )}
    </div>
  );
}

function DateFilter({ filterValue, onChange, inputClass, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  const range = filterValue || {};
  const facet = facetData as import('@/types').DateFacet | undefined;

  return (
    <div className="mt-2 space-y-2">
      {facet && facet.min && facet.max && (
        <div className="text-xs text-gray-400 dark:text-gray-500">
          Диапазон: {facet.min.slice(0, 10)} — {facet.max.slice(0, 10)} ({facet.count})
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400">От</label>
        <input
          type="date"
          value={range.from || ''}
          onChange={(e) =>
            onChange({ ...range, from: e.target.value || undefined })
          }
          min={facet?.min?.slice(0, 10)}
          max={facet?.max?.slice(0, 10)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400">До</label>
        <input
          type="date"
          value={range.to || ''}
          onChange={(e) =>
            onChange({ ...range, to: e.target.value || undefined })
          }
          min={facet?.min?.slice(0, 10)}
          max={facet?.max?.slice(0, 10)}
          className={inputClass}
        />
      </div>
    </div>
  );
}

export const dateFieldRenderer: FieldRenderer = {
  Renderer: DateRenderer,
  Form: DateForm,
  Filter: DateFilter,
};
