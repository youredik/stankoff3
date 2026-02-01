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
};
