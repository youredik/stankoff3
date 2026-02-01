import { apiClient } from './client';
import type { Workspace } from '@/types';

export const workspacesApi = {
  getAll: () => apiClient.get<Workspace[]>('/workspaces').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Workspace>(`/workspaces/${id}`).then((r) => r.data),

  create: (data: Partial<Workspace>) =>
    apiClient.post<Workspace>('/workspaces', data).then((r) => r.data),

  update: (id: string, data: Partial<Workspace>) =>
    apiClient.put<Workspace>(`/workspaces/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/workspaces/${id}`),
};
