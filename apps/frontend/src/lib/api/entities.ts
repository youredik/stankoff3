import { apiClient } from './client';
import type { Entity } from '@/types';

export const entitiesApi = {
  getByWorkspace: (workspaceId: string) =>
    apiClient
      .get<Entity[]>('/entities', { params: { workspaceId } })
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
