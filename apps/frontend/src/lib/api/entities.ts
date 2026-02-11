import { apiClient } from './client';
import type { Entity, FacetResult } from '@/types';

export interface KanbanColumnData {
  status: string;
  items: Entity[];
  total: number;
  hasMore: boolean;
}

export interface KanbanResponse {
  columns: KanbanColumnData[];
  totalAll: number;
}

export interface EntityFilters {
  search?: string;
  assigneeId?: string[];
  priority?: string[];
  dateFrom?: string;
  dateTo?: string;
  customFilters?: Record<string, any>;
}

export interface TableResponse {
  items: Entity[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface TableQueryParams extends EntityFilters {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  status?: string[];
}

function serializeFilters(filters?: EntityFilters) {
  if (!filters) return {};
  const { customFilters, ...rest } = filters;
  return {
    ...rest,
    assigneeId: filters.assigneeId?.join(',') || undefined,
    priority: filters.priority?.join(',') || undefined,
    customFilters: customFilters && Object.keys(customFilters).length > 0
      ? JSON.stringify(customFilters)
      : undefined,
  };
}

export const entitiesApi = {
  getByWorkspace: (workspaceId: string) =>
    apiClient
      .get<Entity[]>('/entities', { params: { workspaceId } })
      .then((r) => r.data),

  getKanban: (workspaceId: string, filters?: EntityFilters, perColumn = 20) =>
    apiClient
      .get<KanbanResponse>('/entities/kanban', {
        params: {
          workspaceId,
          perColumn,
          ...serializeFilters(filters),
        },
      })
      .then((r) => r.data),

  loadMoreColumn: (
    workspaceId: string,
    status: string,
    offset: number,
    filters?: EntityFilters,
    limit = 20,
  ) =>
    apiClient
      .get<{ items: Entity[]; total: number; hasMore: boolean }>(
        '/entities/kanban/column',
        {
          params: {
            workspaceId,
            status,
            offset,
            limit,
            ...serializeFilters(filters),
          },
        },
      )
      .then((r) => r.data),

  getTable: (workspaceId: string, params?: TableQueryParams) => {
    const { customFilters, ...rest } = params || {};
    return apiClient
      .get<TableResponse>('/entities/table', {
        params: {
          workspaceId,
          ...rest,
          assigneeId: params?.assigneeId?.join(',') || undefined,
          priority: params?.priority?.join(',') || undefined,
          status: params?.status?.join(',') || undefined,
          customFilters: customFilters && Object.keys(customFilters).length > 0
            ? JSON.stringify(customFilters)
            : undefined,
        },
      })
      .then((r) => r.data);
  },

  getFacets: (workspaceId: string, filters?: EntityFilters) =>
    apiClient
      .get<FacetResult>('/entities/facets', {
        params: {
          workspaceId,
          ...serializeFilters(filters),
        },
      })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Entity>(`/entities/${id}`).then((r) => r.data),

  create: (data: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>) =>
    apiClient.post<Entity>('/entities', data).then((r) => r.data),

  update: (id: string, data: Partial<Entity>) =>
    apiClient.put<Entity>(`/entities/${id}`, data).then((r) => r.data),

  updateStatus: (id: string, status: string) =>
    apiClient
      .patch<Entity>(`/entities/${id}/status`, { status })
      .then((r) => r.data),

  updateAssignee: (id: string, assigneeId: string | null) =>
    apiClient
      .patch<Entity>(`/entities/${id}/assignee`, { assigneeId })
      .then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/entities/${id}`),

  search: (query: string, limit = 10) =>
    apiClient
      .get<{ results: SearchResult[] }>('/entities/search', {
        params: { q: query, limit },
      })
      .then((r) => r.data.results),

  // Export / Import
  exportCsv: (workspaceId: string) =>
    apiClient
      .get('/entities/export/csv', {
        params: { workspaceId },
        responseType: 'blob',
      })
      .then((r) => r.data),

  exportJson: (workspaceId: string) =>
    apiClient
      .get('/entities/export/json', {
        params: { workspaceId },
        responseType: 'blob',
      })
      .then((r) => r.data),

  importCsv: (workspaceId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post<{ imported: number; errors: string[] }>(
        '/entities/import/csv',
        formData,
        {
          params: { workspaceId },
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      )
      .then((r) => r.data);
  },
};

export interface SearchResult {
  id: string;
  customId: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: { id: string; firstName: string; lastName: string };
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  createdAt: string;
}
