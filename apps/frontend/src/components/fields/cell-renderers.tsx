'use client';

import type { FieldCellRendererProps } from './types';
import type { NumberFieldConfig, DateFieldConfig } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, X as XIcon, ExternalLink, Phone, Mail } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';

const DASH = <span className="text-gray-400 dark:text-gray-600 text-xs">&mdash;</span>;

// ==================== Text ====================
export function TextCellRenderer({ value }: FieldCellRendererProps) {
  if (!value) return DASH;
  return (
    <span className="text-sm text-gray-700 dark:text-gray-300 truncate block max-w-[250px]">
      {value}
    </span>
  );
}

// ==================== Number ====================
function formatCellNumber(value: number, config?: NumberFieldConfig): string {
  const subtype = config?.subtype || 'integer';

  if (subtype === 'money') {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (subtype === 'percent') {
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: 1,
    }).format(value);
  }

  if (subtype === 'decimal') {
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: config?.decimalPlaces ?? 4,
    }).format(value);
  }

  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    useGrouping: subtype !== 'inn',
  }).format(value);
}

export function NumberCellRenderer({ field, value }: FieldCellRendererProps) {
  if (value == null || value === '') return DASH;
  const num = Number(value);
  if (isNaN(num)) return DASH;
  const config = field.config as NumberFieldConfig | undefined;
  const formatted = formatCellNumber(num, config);
  const prefix = config?.prefix || '';
  const suffix = config?.suffix || '';

  return (
    <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap">
      {prefix}{formatted}{suffix}
    </span>
  );
}

// ==================== Select / Status ====================
export function SelectCellRenderer({ field, value }: FieldCellRendererProps) {
  if (!value) return DASH;
  const values = Array.isArray(value) ? value : [value];

  return (
    <div className="flex flex-wrap gap-1">
      {values.slice(0, 3).map((v) => {
        const opt = field.options?.find((o) => o.id === v);
        return (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-[140px]"
            style={{
              backgroundColor: opt?.color ? `${opt.color}20` : undefined,
              color: opt?.color || undefined,
            }}
          >
            {opt?.color && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: opt.color }}
              />
            )}
            {opt?.label || v}
          </span>
        );
      })}
      {values.length > 3 && (
        <span className="text-xs text-gray-400">+{values.length - 3}</span>
      )}
    </div>
  );
}

// ==================== User ====================
export function UserCellRenderer({ value, users }: FieldCellRendererProps) {
  if (!value) return DASH;
  const ids = Array.isArray(value) ? value : [value];

  return (
    <div className="flex items-center gap-1">
      {ids.slice(0, 3).map((id) => {
        const u = users.find((usr) => usr.id === id);
        if (!u) return null;
        return (
          <div
            key={id}
            className="flex items-center gap-1"
            title={`${u.firstName} ${u.lastName}`}
          >
            <UserAvatar
              firstName={u.firstName}
              lastName={u.lastName}
              avatar={u.avatar}
              size="xs"
              userId={u.id}
            />
            {ids.length === 1 && (
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[100px]">
                {u.firstName} {u.lastName}
              </span>
            )}
          </div>
        );
      })}
      {ids.length > 3 && (
        <span className="text-xs text-gray-400">+{ids.length - 3}</span>
      )}
    </div>
  );
}

// ==================== Date ====================
export function DateCellRenderer({ field, value }: FieldCellRendererProps) {
  if (!value) return DASH;
  try {
    const config = field.config as DateFieldConfig | undefined;
    const fmt = config?.includeTime ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy';
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {format(new Date(value), fmt, { locale: ru })}
      </span>
    );
  } catch {
    return DASH;
  }
}

// ==================== Checkbox ====================
export function CheckboxCellRenderer({ value }: FieldCellRendererProps) {
  return Boolean(value) ? (
    <div className="w-4 h-4 rounded bg-green-500 flex items-center justify-center">
      <Check className="w-3 h-3 text-white" />
    </div>
  ) : (
    <div className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
      <XIcon className="w-2.5 h-2.5 text-gray-600 dark:text-gray-300" />
    </div>
  );
}

// ==================== URL ====================
export function UrlCellRenderer({ value }: FieldCellRendererProps) {
  if (!value) return DASH;
  let hostname = '';
  try {
    hostname = new URL(value).hostname;
  } catch {
    hostname = String(value).slice(0, 30);
  }
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline truncate max-w-[180px]"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
      {hostname}
    </a>
  );
}

// ==================== Client ====================
export function ClientCellRenderer({ value }: FieldCellRendererProps) {
  if (!value || typeof value !== 'object') return DASH;
  const client = value as Record<string, any>;
  const name = client.name || client.firstName;
  if (!name && !client.phone && !client.email) return DASH;

  return (
    <div className="flex items-center gap-1.5 truncate">
      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
        {name || 'Без имени'}
      </span>
      {client.phone && <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />}
      {client.email && <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />}
    </div>
  );
}
