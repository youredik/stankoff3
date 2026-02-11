'use client';

import { useCallback } from 'react';
import type { NumberFieldConfig } from '@/types';
import type { FieldRenderer } from './types';

function formatNumber(value: number, config?: NumberFieldConfig): string {
  const subtype = config?.subtype || 'integer';

  if (subtype === 'money') {
    return new Intl.NumberFormat('ru-RU', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (subtype === 'percent') {
    return new Intl.NumberFormat('ru-RU', {
      style: 'decimal',
      maximumFractionDigits: 1,
    }).format(value);
  }

  if (subtype === 'decimal') {
    return new Intl.NumberFormat('ru-RU', {
      style: 'decimal',
      maximumFractionDigits: 4,
    }).format(value);
  }

  // integer, inn
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    maximumFractionDigits: 0,
    useGrouping: subtype !== 'inn',
  }).format(value);
}

function NumberRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const config = field.config as NumberFieldConfig | undefined;

  if (!canEdit) {
    if (value === undefined || value === null || value === '') {
      return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
    }
    const formatted = formatNumber(Number(value), config);
    const prefix = config?.prefix || '';
    const suffix = config?.suffix || (config?.subtype === 'percent' ? '%' : config?.subtype === 'money' ? ' ₽' : '');
    return (
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {prefix}{formatted}{suffix}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {config?.prefix && (
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">{config.prefix}</span>
      )}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onUpdate(e.target.value ? Number(e.target.value) : null)}
        min={config?.min}
        max={config?.max}
        step={config?.step ?? (config?.subtype === 'decimal' || config?.subtype === 'money' ? 0.01 : 1)}
        className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
        placeholder={field.description || ''}
      />
      {(config?.suffix || config?.subtype === 'percent' || config?.subtype === 'money') && (
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          {config?.suffix || (config?.subtype === 'percent' ? '%' : '₽')}
        </span>
      )}
    </div>
  );
}

function NumberForm({ field, value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const config = field.config as NumberFieldConfig | undefined;

  return (
    <div className="flex items-center gap-1">
      {config?.prefix && (
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">{config.prefix}</span>
      )}
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        min={config?.min}
        max={config?.max}
        step={config?.step ?? (config?.subtype === 'decimal' || config?.subtype === 'money' ? 0.01 : 1)}
        placeholder={field.description || ''}
        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {(config?.suffix || config?.subtype === 'percent' || config?.subtype === 'money') && (
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          {config?.suffix || (config?.subtype === 'percent' ? '%' : '₽')}
        </span>
      )}
    </div>
  );
}

function NumberFilter({ field, filterValue, onChange, inputClass, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  const range = filterValue || {};
  const facet = facetData as import('@/types').NumberFacet | undefined;
  const dataMin = facet?.min;
  const dataMax = facet?.max;
  const hasRange = facet != null && dataMin != null && dataMax != null && dataMin !== dataMax;

  const sliderMin = dataMin ?? 0;
  const sliderMax = dataMax ?? 100;
  const step = (sliderMax - sliderMin) / 100 || 1;

  const currentMin = range.min ?? sliderMin;
  const currentMax = range.max ?? sliderMax;

  // Percentage positions for the highlighted track segment
  const minPercent = hasRange ? ((currentMin - sliderMin) / (sliderMax - sliderMin)) * 100 : 0;
  const maxPercent = hasRange ? ((currentMax - sliderMin) / (sliderMax - sliderMin)) * 100 : 100;

  const onMinSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    // Prevent min from exceeding max
    const clamped = Math.min(val, (range.max ?? sliderMax) - step);
    onChange({ ...range, min: clamped <= sliderMin ? undefined : clamped });
  }, [range, sliderMin, sliderMax, step, onChange]);

  const onMaxSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    // Prevent max from going below min
    const clamped = Math.max(val, (range.min ?? sliderMin) + step);
    onChange({ ...range, max: clamped >= sliderMax ? undefined : clamped });
  }, [range, sliderMin, sliderMax, step, onChange]);

  return (
    <div className="mt-2 space-y-2">
      {hasRange && (
        <div className="text-xs text-gray-400 dark:text-gray-500">
          Диапазон: {dataMin} — {dataMax} ({facet!.count})
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Мин</label>
          <input
            type="number"
            value={range.min ?? ''}
            onChange={(e) =>
              onChange({
                ...range,
                min: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder={dataMin != null ? String(dataMin) : 'Мин'}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Макс</label>
          <input
            type="number"
            value={range.max ?? ''}
            onChange={(e) =>
              onChange({
                ...range,
                max: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder={dataMax != null ? String(dataMax) : 'Макс'}
            className={inputClass}
          />
        </div>
      </div>
      {/* Dual-range slider */}
      {hasRange && (
        <div className="relative h-6 flex items-center">
          {/* Track background */}
          <div className="absolute left-0 right-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
          {/* Highlighted range segment */}
          <div
            className="absolute h-1.5 bg-primary-500 rounded-full"
            style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
          />
          {/* Min thumb */}
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={currentMin}
            onChange={onMinSlider}
            className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-20"
          />
          {/* Max thumb */}
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={currentMax}
            onChange={onMaxSlider}
            className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:relative [&::-moz-range-thumb]:z-30"
          />
        </div>
      )}
    </div>
  );
}

export const numberFieldRenderer: FieldRenderer = {
  Renderer: NumberRenderer,
  Form: NumberForm,
  Filter: NumberFilter,
};
