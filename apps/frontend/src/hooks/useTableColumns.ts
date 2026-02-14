'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type {
  Field,
  FieldType,
  WorkspaceSection,
  TableColumnConfig,
  TableColumnsPreference,
} from '@/types';

const STORAGE_PREFIX = 'stankoff-table-columns:';
const CURRENT_VERSION = 1;

// ==================== Системные колонки ====================

export interface SystemColumn {
  fieldId: string;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
  defaultWidth?: number;
}

const SYSTEM_COLUMNS: SystemColumn[] = [
  { fieldId: 'customId', label: 'Номер', sortable: true, defaultVisible: true, defaultWidth: 112 },
  { fieldId: 'title', label: 'Название', sortable: true, defaultVisible: true },
  { fieldId: 'status', label: 'Статус', sortable: true, defaultVisible: true, defaultWidth: 160 },
  { fieldId: 'priority', label: 'Приоритет', sortable: true, defaultVisible: true, defaultWidth: 128 },
  { fieldId: 'assignee', label: 'Исполнитель', sortable: true, defaultVisible: true, defaultWidth: 176 },
  { fieldId: 'createdAt', label: 'Создана', sortable: true, defaultVisible: true, defaultWidth: 120 },
  { fieldId: 'commentCount', label: 'Комментарии', sortable: true, defaultVisible: true, defaultWidth: 64 },
];

const SYSTEM_COLUMN_IDS = new Set(SYSTEM_COLUMNS.map((s) => s.fieldId));

// ==================== Smart defaults ====================

/** Типы полей, подходящие для компактного отображения в таблице */
const TABLE_FRIENDLY_TYPES: Set<FieldType> = new Set([
  'text', 'number', 'date', 'select', 'status', 'user', 'checkbox', 'url',
]);

/** Типы, скрытые по умолчанию (слишком объёмные для ячеек) */
const NOT_DEFAULT_VISIBLE: Set<FieldType> = new Set([
  'textarea', 'file', 'relation', 'geolocation', 'client',
]);

/** fieldId полей, дублирующих системные колонки */
const SKIP_FIELD_IDS = new Set(['title', 'assignee', 'priority']);
/** Типы, дублирующие системные колонки */
const SKIP_FIELD_TYPES: Set<FieldType> = new Set(['status']);

const MAX_DEFAULT_CUSTOM_COLUMNS = 5;

function buildSmartDefaults(sections: WorkspaceSection[]): TableColumnConfig[] {
  const configs: TableColumnConfig[] = [];
  let order = 0;

  // Системные колонки
  for (const sys of SYSTEM_COLUMNS) {
    configs.push({
      fieldId: sys.fieldId,
      visible: sys.defaultVisible,
      width: sys.defaultWidth,
      order: order++,
    });
  }

  // Кастомные поля из workspace sections
  const seenFieldIds = new Set(SYSTEM_COLUMNS.map((s) => s.fieldId));
  let customVisible = 0;

  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    for (const field of section.fields) {
      if (seenFieldIds.has(field.id)) continue;
      if (SKIP_FIELD_TYPES.has(field.type)) continue;
      if (SKIP_FIELD_IDS.has(field.id)) continue;
      seenFieldIds.add(field.id);

      const shouldBeVisible =
        TABLE_FRIENDLY_TYPES.has(field.type) &&
        !NOT_DEFAULT_VISIBLE.has(field.type) &&
        customVisible < MAX_DEFAULT_CUSTOM_COLUMNS;

      if (shouldBeVisible) customVisible++;

      configs.push({
        fieldId: field.id,
        visible: shouldBeVisible,
        order: order++,
      });
    }
  }

  return configs;
}

// ==================== localStorage ====================

function loadPreference(workspaceId: string): TableColumnsPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + workspaceId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TableColumnsPreference;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePreference(workspaceId: string, pref: TableColumnsPreference): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + workspaceId, JSON.stringify(pref));
  } catch { /* quota exceeded — ignore */ }
}

// ==================== Resolved column ====================

export interface ResolvedColumn {
  fieldId: string;
  label: string;
  sortable: boolean;
  /** Ключ для backend сортировки: 'customId' | 'title' | 'data.price' и т.д. */
  sortKey: string;
  visible: boolean;
  width?: number;
  order: number;
  isSystem: boolean;
  /** Field definition из workspace sections (undefined для системных) */
  field?: Field;
}

// ==================== Helpers ====================

const SORTABLE_TYPES: Set<FieldType> = new Set([
  'text', 'number', 'date', 'select', 'checkbox', 'url',
]);

function canSortField(field?: Field): boolean {
  if (!field) return false;
  return SORTABLE_TYPES.has(field.type);
}

function mergeWithCurrentFields(
  saved: TableColumnConfig[],
  sections: WorkspaceSection[],
): TableColumnConfig[] {
  const currentFieldIds = new Set<string>();
  for (const section of sections) {
    for (const field of section.fields) {
      currentFieldIds.add(field.id);
    }
  }
  // Системные поля всегда присутствуют
  for (const sys of SYSTEM_COLUMNS) {
    currentFieldIds.add(sys.fieldId);
  }

  // Оставляем сохранённые колонки, которые ещё существуют
  const merged = saved.filter((c) => currentFieldIds.has(c.fieldId));
  const savedIds = new Set(merged.map((c) => c.fieldId));

  // Добавляем новые поля (добавленные после сохранения) — скрытые
  let maxOrder = Math.max(0, ...merged.map((c) => c.order));
  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    for (const field of section.fields) {
      if (
        !savedIds.has(field.id) &&
        !SKIP_FIELD_TYPES.has(field.type) &&
        !SKIP_FIELD_IDS.has(field.id)
      ) {
        merged.push({
          fieldId: field.id,
          visible: false,
          order: ++maxOrder,
        });
      }
    }
  }

  return merged;
}

// ==================== Hook ====================

export function useTableColumns(
  workspaceId: string,
  sections: WorkspaceSection[] | undefined,
) {
  const [configs, setConfigs] = useState<TableColumnConfig[]>([]);
  const sectionsRef = useRef(sections);

  // Инициализация: загрузить из localStorage или smart defaults
  useEffect(() => {
    if (!sections) return;
    sectionsRef.current = sections;

    const saved = loadPreference(workspaceId);
    if (saved) {
      setConfigs(mergeWithCurrentFields(saved.columns, sections));
    } else {
      setConfigs(buildSmartDefaults(sections));
    }
  }, [workspaceId, sections]);

  // Resolve columns для рендеринга
  const columns = useMemo<ResolvedColumn[]>(() => {
    if (!sections || configs.length === 0) return [];

    const fieldMap = new Map<string, Field>();
    for (const section of sections) {
      for (const field of section.fields) {
        fieldMap.set(field.id, field);
      }
    }

    return configs
      .sort((a, b) => a.order - b.order)
      .map((config): ResolvedColumn => {
        const sys = SYSTEM_COLUMNS.find((s) => s.fieldId === config.fieldId);
        const field = fieldMap.get(config.fieldId);

        if (sys) {
          return {
            fieldId: config.fieldId,
            label: sys.label,
            sortable: sys.sortable,
            sortKey: config.fieldId,
            visible: config.visible,
            width: config.width ?? sys.defaultWidth,
            order: config.order,
            isSystem: true,
          };
        }

        return {
          fieldId: config.fieldId,
          label: field?.name || config.fieldId,
          sortable: canSortField(field),
          sortKey: `data.${config.fieldId}`,
          visible: config.visible,
          width: config.width,
          order: config.order,
          isSystem: false,
          field,
        };
      });
  }, [configs, sections]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible),
    [columns],
  );

  // Мутации
  const toggleVisibility = useCallback(
    (fieldId: string) => {
      setConfigs((prev) => {
        const next = prev.map((c) =>
          c.fieldId === fieldId ? { ...c, visible: !c.visible } : c,
        );
        savePreference(workspaceId, { version: CURRENT_VERSION, columns: next });
        return next;
      });
    },
    [workspaceId],
  );

  const reorder = useCallback(
    (orderedFieldIds: string[]) => {
      setConfigs((prev) => {
        const idxMap = new Map(orderedFieldIds.map((id, i) => [id, i]));
        const next = prev.map((c) => ({
          ...c,
          order: idxMap.get(c.fieldId) ?? c.order,
        }));
        next.sort((a, b) => a.order - b.order);
        savePreference(workspaceId, { version: CURRENT_VERSION, columns: next });
        return next;
      });
    },
    [workspaceId],
  );

  const resetToDefaults = useCallback(() => {
    if (!sectionsRef.current) return;
    const defaults = buildSmartDefaults(sectionsRef.current);
    setConfigs(defaults);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_PREFIX + workspaceId);
    }
  }, [workspaceId]);

  return {
    columns,
    visibleColumns,
    toggleVisibility,
    reorder,
    resetToDefaults,
  };
}
