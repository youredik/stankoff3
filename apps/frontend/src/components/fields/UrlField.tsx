'use client';

import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { UrlFieldConfig } from '@/types';
import type { FieldRenderer } from './types';

interface OgPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

// Локальный кэш превью (в памяти сессии)
const previewCache = new Map<string, OgPreview>();

function OgPreviewCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<OgPreview | null>(previewCache.get(url) || null);
  const [loading, setLoading] = useState(!previewCache.has(url));

  useEffect(() => {
    if (previewCache.has(url)) return;

    let cancelled = false;
    setLoading(true);

    apiClient
      .get<OgPreview>(`/og-preview?url=${encodeURIComponent(url)}`)
      .then((r) => {
        if (!cancelled) {
          previewCache.set(url, r.data);
          setPreview(r.data);
        }
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-1.5 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  if (!preview?.title) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-16 h-16 rounded object-cover flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="min-w-0 flex-1">
        {preview.siteName && (
          <div className="text-[10px] uppercase text-gray-400 dark:text-gray-500 font-medium mb-0.5">
            {preview.siteName}
          </div>
        )}
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {preview.title}
        </div>
        {preview.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
            {preview.description}
          </div>
        )}
      </div>
    </a>
  );
}

function UrlRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');
  const config = field.config as UrlFieldConfig | undefined;
  const showPreview = config?.showPreview ?? false;

  const handleSave = () => {
    onUpdate(editValue.trim() || null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditValue(value ?? '');
      setIsEditing(false);
    }
  };

  if (!canEdit) {
    return value ? (
      <div>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="truncate max-w-[250px]">{value}</span>
        </a>
        {showPreview && <OgPreviewCard url={value} />}
      </div>
    ) : (
      <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
    );
  }

  if (isEditing) {
    return (
      <input
        type="url"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder="https://..."
        className="w-full border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
        autoFocus
      />
    );
  }

  return (
    <div>
      <div
        onClick={() => {
          setEditValue(value ?? '');
          setIsEditing(true);
        }}
        className="text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1 min-h-[28px] flex items-center"
      >
        {value ? (
          <span className="text-primary-600 dark:text-primary-400 truncate">{value}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">Нажмите для ввода URL...</span>
        )}
      </div>
      {showPreview && value && <OgPreviewCard url={value} />}
    </div>
  );
}

function UrlForm({ value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  return (
    <input
      type="url"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://..."
      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
    />
  );
}

function UrlFilter({ field, filterValue, onChange, inputClass, facetData }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  const facet = facetData as import('@/types').TextFacet | undefined;

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
      />
    </div>
  );
}

export const urlFieldRenderer: FieldRenderer = {
  Renderer: UrlRenderer,
  Form: UrlForm,
  Filter: UrlFilter,
};
