'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, ExternalLink, X,
  User as UserIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Entity, Workspace, Field, FieldOption } from '@/types';

// ===================== Экспортируемые типы =====================

export interface FullEntityData {
  entity: Entity;
  workspace: Workspace;
}

// ===================== Константы =====================

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Высокий', medium: 'Средний', low: 'Низкий',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const SKIP_FIELD_TYPES = new Set(['status']);
const SKIP_FIELD_IDS = new Set(['title', 'assignee', 'priority']);

// ===================== Форматирование значений полей =====================

function formatFieldValue(
  field: Field,
  value: unknown,
  users?: { id: string; firstName: string; lastName: string }[],
): string {
  if (value === null || value === undefined || value === '') return '—';

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'url':
      return String(value);

    case 'number':
      return typeof value === 'number' ? value.toLocaleString('ru-RU') : String(value);

    case 'date': {
      try {
        const d = new Date(value as string);
        if (isNaN(d.getTime())) return String(value);
        const includeTime = (field.config as { includeTime?: boolean } | undefined)?.includeTime;
        return format(d, includeTime ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy', { locale: ru });
      } catch {
        return String(value);
      }
    }

    case 'select': {
      if (Array.isArray(value)) {
        return value.map((v) => field.options?.find((o) => o.id === v)?.label ?? v).join(', ');
      }
      return field.options?.find((o) => o.id === value)?.label ?? String(value);
    }

    case 'user': {
      if (!users) return String(value);
      if (Array.isArray(value)) {
        return value
          .map((uid) => {
            const u = users.find((usr) => usr.id === uid);
            return u ? `${u.firstName} ${u.lastName}` : uid;
          })
          .join(', ');
      }
      const u = users.find((usr) => usr.id === value);
      return u ? `${u.firstName} ${u.lastName}` : String(value);
    }

    case 'checkbox':
      return value ? 'Да' : 'Нет';

    case 'client': {
      if (typeof value === 'object' && value !== null) {
        const c = value as Record<string, string>;
        const parts = [c.name, c.phone, c.email].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : '—';
      }
      return String(value);
    }

    case 'geolocation': {
      if (typeof value === 'object' && value !== null) {
        const g = value as Record<string, unknown>;
        return (g.address as string) || `${g.lat}, ${g.lng}`;
      }
      return String(value);
    }

    case 'file': {
      if (Array.isArray(value)) return `${value.length} файл(ов)`;
      return typeof value === 'object'
        ? (value as Record<string, string>)?.name || '1 файл'
        : String(value);
    }

    case 'relation': {
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      return ids.length > 0 ? ids.join(', ') : '—';
    }

    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

// ===================== Select бейджи =====================

function SelectValueBadges({ value, options }: { value: unknown; options: FieldOption[] }) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  if (values.length === 0) return <span>—</span>;

  return (
    <span className="inline-flex flex-wrap gap-1">
      {values.map((v) => {
        const opt = options.find((o) => o.id === v);
        if (!opt) return <span key={String(v)}>{String(v)}</span>;
        return (
          <span
            key={opt.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            {opt.color && (
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: opt.color }} />
            )}
            {opt.label}
          </span>
        );
      })}
    </span>
  );
}

// ===================== Скелетон =====================

export function EntityCardSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden animate-pulse">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/70">
        <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="w-12 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="w-20 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="w-3/4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="w-1/2 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="w-2/3 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

// ===================== Основная карточка =====================

export function RelatedEntityCard({
  data,
  users,
  canEdit,
  onRemove,
  onNavigate,
}: {
  data: FullEntityData;
  users?: { id: string; firstName: string; lastName: string }[];
  canEdit: boolean;
  onRemove?: () => void;
  onNavigate: () => void;
}) {
  const { entity, workspace } = data;
  const [expanded, setExpanded] = useState(true);

  // Статус из workspace options
  const statusOption = useMemo(() => {
    const statusField = workspace.sections
      ?.flatMap((s) => s.fields)
      .find((f) => f.type === 'status');
    return statusField?.options?.find((o) => o.id === entity.status);
  }, [workspace.sections, entity.status]);

  // Кастомные поля с значениями
  const customFieldSections = useMemo(() => {
    if (!workspace.sections) return [];
    return workspace.sections
      .sort((a, b) => a.order - b.order)
      .map((section) => {
        const fields = section.fields.filter(
          (f) => !SKIP_FIELD_TYPES.has(f.type) && !SKIP_FIELD_IDS.has(f.id),
        );
        const fieldsWithValues = fields.filter((f) => {
          const val = entity.data?.[f.id];
          return val !== null && val !== undefined && val !== '';
        });
        return { ...section, fields: fieldsWithValues };
      })
      .filter((s) => s.fields.length > 0);
  }, [workspace.sections, entity.data]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      {/* Заголовок */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/70">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label={expanded ? 'Свернуть' : 'Развернуть'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <span className="text-sm">{workspace.icon || '📋'}</span>

        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {entity.customId}
        </span>

        {statusOption && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white"
            style={{ backgroundColor: statusOption.color }}
          >
            {statusOption.label}
          </span>
        )}

        {entity.priority && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_COLORS[entity.priority] || ''}`}>
            {PRIORITY_LABELS[entity.priority] || entity.priority}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={onNavigate}
          className="p-1 text-gray-400 hover:text-primary-500 rounded transition-colors"
          title="Открыть заявку"
          aria-label="Открыть заявку"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        {canEdit && onRemove && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="Удалить связь"
            aria-label="Удалить связь"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Содержимое */}
      {expanded && (
        <div className="px-3 py-2 space-y-3">
          {/* Название + описание */}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {entity.title}
            </p>
            {entity.data?.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                {entity.data.description}
              </p>
            )}
          </div>

          {/* Исполнитель */}
          {entity.assignee && (
            <div className="flex items-center gap-2">
              <UserIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                {entity.assignee.firstName} {entity.assignee.lastName}
              </span>
            </div>
          )}

          {/* Кастомные поля по секциям */}
          {customFieldSections.map((section) => (
            <div key={section.id}>
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase mb-1">
                {section.name}
              </p>
              <div className="space-y-1">
                {section.fields.map((field) => (
                  <div key={field.id} className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-1/3 flex-shrink-0 truncate">
                      {field.name}
                    </span>
                    <span className="text-xs text-gray-800 dark:text-gray-200 flex-1 break-words">
                      {field.type === 'select' && field.options ? (
                        <SelectValueBadges value={entity.data?.[field.id]} options={field.options} />
                      ) : (
                        formatFieldValue(field, entity.data?.[field.id], users)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Дата создания */}
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Создано {format(new Date(entity.createdAt), 'dd.MM.yyyy', { locale: ru })}
          </p>
        </div>
      )}
    </div>
  );
}
