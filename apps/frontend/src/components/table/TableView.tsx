'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Filter,
  Settings,
  X,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Columns3,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EntityDetailPanel } from '@/components/kanban/EntityDetailPanel';
import { CreateEntityModal } from '@/components/kanban/CreateEntityModal';
import {
  FilterPanel,
  createEmptyFilters,
  type FilterState,
} from '@/components/kanban/FilterPanel';
import { ColumnSettingsPanel } from './ColumnSettingsPanel';
import { useEntityStore } from '@/store/useEntityStore';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePermissionCan } from '@/store/usePermissionStore';
import { filtersToApi } from '@/lib/utils/filters';
import SearchableUserSelect from '@/components/ui/SearchableUserSelect';
import { useWorkspaceFilters } from '@/hooks/useWorkspaceFilters';
import { useFacets } from '@/hooks/useFacets';
import { useTableColumns, type ResolvedColumn } from '@/hooks/useTableColumns';
import { fieldRegistry } from '@/components/fields';
import type { Entity, FieldOption } from '@/types';

interface TableViewProps {
  workspaceId: string;
  categoryId?: string;
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: 'Критический', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  high: { label: 'Высокий', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  medium: { label: 'Средний', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  low: { label: 'Низкий', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ==================== SortHeader ====================

function SortHeader({
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  column: ResolvedColumn;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  onSort: (sortKey: string) => void;
}) {
  const active = sortBy === column.sortKey;
  const widthStyle = column.width ? { width: column.width, minWidth: column.width } : undefined;

  if (!column.sortable) {
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
        style={widthStyle}
      >
        {column.fieldId === 'commentCount' ? (
          <MessageSquare className="w-3.5 h-3.5" />
        ) : (
          column.label
        )}
      </th>
    );
  }

  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
      style={widthStyle}
    >
      <button
        onClick={() => onSort(column.sortKey)}
        className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        {column.fieldId === 'commentCount' ? (
          <MessageSquare className="w-3.5 h-3.5" />
        ) : (
          column.label
        )}
        {active ? (
          sortOrder === 'ASC' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

// ==================== Pagination ====================

function Pagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {from}&ndash;{to} из {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[32px] h-8 rounded text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-primary-500 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ==================== TableCell — универсальный рендерер ячейки ====================

function TableCell({
  column,
  entity,
  users,
  statuses,
  statusMap,
  canEditEntities,
  onStatusChange,
  onAssigneeChange,
}: {
  column: ResolvedColumn;
  entity: Entity;
  users: any[];
  statuses: FieldOption[];
  statusMap: Map<string, FieldOption>;
  canEditEntities: boolean;
  onStatusChange: (entityId: string, status: string) => void;
  onAssigneeChange: (entityId: string, assigneeId: string | null) => void;
}) {
  // Системные колонки — сохраняем текущую логику
  if (column.isSystem) {
    switch (column.fieldId) {
      case 'customId':
        return (
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
            {entity.customId}
          </span>
        );

      case 'title':
        return (
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
            {entity.title}
          </span>
        );

      case 'status': {
        const statusOption = statusMap.get(entity.status);
        if (canEditEntities) {
          return (
            <select
              value={entity.status}
              onChange={(e) => onStatusChange(entity.id, e.target.value)}
              className="text-xs font-medium border rounded-lg px-2 py-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              style={statusOption?.color ? {
                backgroundColor: statusOption.color + '20',
                color: statusOption.color,
                borderColor: statusOption.color + '40',
              } : undefined}
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          );
        }
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            style={statusOption?.color ? {
              backgroundColor: statusOption.color + '20',
              color: statusOption.color,
            } : undefined}
          >
            {statusOption?.label || entity.status}
          </span>
        );
      }

      case 'priority': {
        const priorityInfo = entity.priority ? PRIORITY_LABELS[entity.priority] : null;
        return priorityInfo ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityInfo.color}`}>
            {priorityInfo.label}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">&mdash;</span>
        );
      }

      case 'assignee':
        if (canEditEntities) {
          return (
            <SearchableUserSelect
              value={entity.assigneeId || null}
              onChange={(userId) => onAssigneeChange(entity.id, userId)}
              users={users}
              placeholder="Не назначен"
              emptyLabel="Не назначен"
              compact
            />
          );
        }
        return (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {entity.assignee
              ? `${entity.assignee.firstName} ${entity.assignee.lastName}`
              : <span className="text-gray-400 dark:text-gray-500">&mdash;</span>
            }
          </span>
        );

      case 'createdAt':
        return (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(entity.createdAt)}
          </span>
        );

      case 'commentCount':
        return (entity as any).commentCount > 0 ? (
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MessageSquare className="w-3 h-3" />
            {(entity as any).commentCount}
          </span>
        ) : null;

      default:
        return null;
    }
  }

  // Динамические колонки — через fieldRegistry
  if (!column.field) {
    return <span className="text-gray-400 dark:text-gray-600 text-xs">&mdash;</span>;
  }

  const renderer = fieldRegistry[column.field.type];
  const CellComp = renderer?.CellRenderer;
  const value = entity.data?.[column.fieldId];

  if (CellComp) {
    return <CellComp field={column.field} value={value} users={users} entity={entity} />;
  }

  // Fallback: read-only Renderer
  if (renderer?.Renderer) {
    return (
      <div className="max-h-8 overflow-hidden">
        <renderer.Renderer field={column.field} value={value} users={users} canEdit={false} onUpdate={() => {}} />
      </div>
    );
  }

  // Ultimate fallback
  return (
    <span className="text-sm text-gray-500 dark:text-gray-400 truncate block max-w-[200px]">
      {value != null ? String(value) : <span className="text-gray-400">&mdash;</span>}
    </span>
  );
}

// ==================== TableView ====================

export function TableView({ workspaceId, categoryId }: TableViewProps) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [filters, setFilters] = useWorkspaceFilters(workspaceId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    tableItems,
    tableLoading,
    tableTotal,
    tablePage,
    tablePerPage,
    tableTotalPages,
    tableSortBy,
    tableSortOrder,
    fetchTable,
    setTableSort,
    setTablePage,
    fetchUsers,
    selectedEntity,
    users,
    updateStatus,
    updateAssignee,
  } = useEntityStore();
  const { openEntity } = useEntityNavigation();

  const { currentWorkspace, fetchWorkspace } = useWorkspaceStore();
  const can = usePermissionCan();

  const isAdmin = can('workspace:settings:read', workspaceId);
  const canEditEntities = can('workspace:entity:update', workspaceId);
  const { facets } = useFacets(workspaceId, filters);

  // Динамические колонки из workspace sections
  const {
    columns: allColumns,
    visibleColumns,
    toggleVisibility,
    reorder,
    resetToDefaults,
  } = useTableColumns(workspaceId, currentWorkspace?.sections);

  // Status options from workspace
  const statuses = useMemo<FieldOption[]>(() => {
    if (!currentWorkspace?.sections) return [];
    for (const section of currentWorkspace.sections) {
      const statusField = section.fields.find((f) => f.type === 'status');
      if (statusField?.options) return statusField.options;
    }
    return [];
  }, [currentWorkspace]);

  const statusMap = useMemo(() => {
    const map = new Map<string, FieldOption>();
    statuses.forEach((s) => map.set(s.id, s));
    return map;
  }, [statuses]);

  // Load data
  useEffect(() => {
    fetchWorkspace(workspaceId);
    fetchUsers();
  }, [workspaceId, fetchWorkspace, fetchUsers]);

  // Определяем тип поля для JSONB-сортировки (number, date, text)
  const sortFieldType = useMemo(() => {
    if (!tableSortBy.startsWith('data.')) return undefined;
    const col = allColumns.find((c) => c.sortKey === tableSortBy);
    return col?.field?.type;
  }, [tableSortBy, allColumns]);

  // Fetch table when workspace, sort, page, or filters change
  useEffect(() => {
    const apiFilters = filtersToApi(filters);
    if (categoryId) {
      apiFilters.customFilters = { ...apiFilters.customFilters, categoryId };
    }
    fetchTable(workspaceId, {
      page: tablePage,
      perPage: tablePerPage,
      sortBy: tableSortBy,
      sortOrder: tableSortOrder,
      sortFieldType,
      ...apiFilters,
    });
  }, [workspaceId, tablePage, tablePerPage, tableSortBy, tableSortOrder, sortFieldType, fetchTable, filters, categoryId]);

  const handleSort = useCallback((sortKey: string) => {
    const { tableSortBy, tableSortOrder } = useEntityStore.getState();
    const newOrder = tableSortBy === sortKey && tableSortOrder === 'ASC' ? 'DESC' : 'ASC';
    setTableSort(sortKey, newOrder);
  }, [setTableSort]);

  const handlePageChange = useCallback((page: number) => {
    setTablePage(page);
    setSelectedIds(new Set());
  }, [setTablePage]);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setTablePage(1);
    setSelectedIds(new Set());
  }, [setFilters, setTablePage]);

  const handleStatusChange = useCallback(async (entityId: string, newStatus: string) => {
    await updateStatus(entityId, newStatus);
    const apiFilters = filtersToApi(filters);
    fetchTable(workspaceId, { ...apiFilters });
  }, [updateStatus, fetchTable, workspaceId, filters]);

  const handleAssigneeChange = useCallback(async (entityId: string, assigneeId: string | null) => {
    await updateAssignee(entityId, assigneeId);
    const apiFilters = filtersToApi(filters);
    fetchTable(workspaceId, { ...apiFilters });
  }, [updateAssignee, fetchTable, workspaceId, filters]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === tableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tableItems.map((e) => e.id)));
    }
  }, [selectedIds.size, tableItems]);

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    filters.assigneeIds.length +
    filters.priorities.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  return (
    <div className="flex gap-0">
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-6 px-6 pb-4 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {currentWorkspace?.name || 'Загрузка...'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {tableTotal} {tableTotal === 1 ? 'запись' : tableTotal < 5 ? 'записи' : 'записей'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Filter className="w-4 h-4" />
                Фильтры
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-primary-500 text-white rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {activeFilterCount > 0 && (
                <button
                  onClick={() => handleFiltersChange(createEmptyFilters())}
                  className="flex items-center gap-1 px-2 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-3.5 h-3.5" />
                  Сбросить
                </button>
              )}

              {/* Column settings */}
              <button
                onClick={() => setShowColumnSettings(!showColumnSettings)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showColumnSettings
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                aria-label="Настройка колонок"
              >
                <Columns3 className="w-4 h-4" />
                Колонки
              </button>

              {/* Settings */}
              {isAdmin && (
                <button
                  onClick={() => router.push(`/workspace/${workspaceId}/settings`)}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  aria-label="Настройки workspace"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}

              {/* Create */}
              {canEditEntities && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Создать
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={tableItems.length > 0 && selectedIds.size === tableItems.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 dark:border-gray-600 text-primary-500 focus:ring-primary-500"
                    />
                  </th>
                  {visibleColumns.map((col) => (
                    <SortHeader
                      key={col.fieldId}
                      column={col}
                      sortBy={tableSortBy}
                      sortOrder={tableSortOrder}
                      onSort={handleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tableLoading && tableItems.length === 0 ? (
                  // Skeleton rows
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3"><div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" /></td>
                      {visibleColumns.map((col) => (
                        <td key={col.fieldId} className="px-4 py-3">
                          <div className="w-20 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tableItems.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      {activeFilterCount > 0 ? 'Нет записей, подходящих под фильтры' : 'Нет записей'}
                    </td>
                  </tr>
                ) : (
                  tableItems.map((entity) => (
                    <tr
                      key={entity.id}
                      onClick={() => openEntity(entity.id)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                        selectedEntity?.id === entity.id ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entity.id)}
                          onChange={() => toggleSelect(entity.id)}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-500 focus:ring-primary-500"
                        />
                      </td>

                      {/* Dynamic columns */}
                      {visibleColumns.map((col) => (
                        <td
                          key={col.fieldId}
                          className="px-4 py-3"
                          style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                          onClick={
                            col.fieldId === 'status' || col.fieldId === 'assignee'
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
                          <TableCell
                            column={col}
                            entity={entity}
                            users={users}
                            statuses={statuses}
                            statusMap={statusMap}
                            canEditEntities={canEditEntities}
                            onStatusChange={handleStatusChange}
                            onAssigneeChange={handleAssigneeChange}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            page={tablePage}
            totalPages={tableTotalPages}
            total={tableTotal}
            perPage={tablePerPage}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClose={() => setShowFilters(false)}
          facets={facets}
        />
      )}

      {/* Column Settings Panel */}
      {showColumnSettings && (
        <ColumnSettingsPanel
          columns={allColumns}
          onToggleVisibility={toggleVisibility}
          onReorder={reorder}
          onReset={resetToDefaults}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {/* Entity Detail Panel */}
      {selectedEntity && <EntityDetailPanel />}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateEntityModal
          workspaceId={workspaceId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
