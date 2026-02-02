import { apiClient } from './client';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '@/types';

export const workspacesApi = {
  getAll: () => apiClient.get<Workspace[]>('/workspaces').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<Workspace>(`/workspaces/${id}`).then((r) => r.data),

  create: (data: Partial<Workspace>) =>
    apiClient.post<Workspace>('/workspaces', data).then((r) => r.data),

  update: (id: string, data: Partial<Workspace>) =>
    apiClient.put<Workspace>(`/workspaces/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/workspaces/${id}`),

  // Получить роль текущего пользователя в workspace
  getMyRole: (workspaceId: string) =>
    apiClient.get<{ role: WorkspaceRole | null }>(`/workspaces/${workspaceId}/my-role`).then((r) => r.data),

  // Получить роли текущего пользователя во всех workspaces
  getMyRoles: () =>
    apiClient.get<Record<string, WorkspaceRole>>('/workspaces/my-roles').then((r) => r.data),

  // Управление участниками
  getMembers: (workspaceId: string) =>
    apiClient.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`).then((r) => r.data),

  addMember: (workspaceId: string, userId: string, role?: WorkspaceRole) =>
    apiClient
      .post<WorkspaceMember>(`/workspaces/${workspaceId}/members`, { userId, role })
      .then((r) => r.data),

  updateMemberRole: (workspaceId: string, userId: string, role: WorkspaceRole) =>
    apiClient
      .put<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, { role })
      .then((r) => r.data),

  removeMember: (workspaceId: string, userId: string) =>
    apiClient.delete(`/workspaces/${workspaceId}/members/${userId}`),

  // Дублирование, архивирование, экспорт
  duplicate: (workspaceId: string, name?: string) =>
    apiClient.post<Workspace>(`/workspaces/${workspaceId}/duplicate`, { name }).then((r) => r.data),

  setArchived: (workspaceId: string, isArchived: boolean) =>
    apiClient.patch<Workspace>(`/workspaces/${workspaceId}/archive`, { isArchived }).then((r) => r.data),

  exportJson: (workspaceId: string) =>
    `/api/workspaces/${workspaceId}/export/json`,

  exportCsv: (workspaceId: string) =>
    `/api/workspaces/${workspaceId}/export/csv`,
};
