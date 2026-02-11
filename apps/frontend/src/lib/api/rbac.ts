import { apiClient } from './client';
import { Role, RoleScope, PermissionMeta, MyPermissions } from '@/types';

export const rbacApi = {
  // ── Роли ──────────────────────────────────────

  getRoles: (scope?: RoleScope) =>
    apiClient
      .get<Role[]>('/rbac/roles', { params: scope ? { scope } : undefined })
      .then((r) => r.data),

  getRole: (id: string) =>
    apiClient.get<Role>(`/rbac/roles/${id}`).then((r) => r.data),

  createRole: (data: { name: string; slug: string; description?: string; scope: RoleScope; permissions: string[] }) =>
    apiClient.post<Role>('/rbac/roles', data).then((r) => r.data),

  updateRole: (id: string, data: Partial<{ name: string; description: string; permissions: string[] }>) =>
    apiClient.put<Role>(`/rbac/roles/${id}`, data).then((r) => r.data),

  deleteRole: (id: string) =>
    apiClient.delete(`/rbac/roles/${id}`).then((r) => r.data),

  // ── Permissions ──────────────────────────────────

  getPermissionRegistry: () =>
    apiClient.get<PermissionMeta[]>('/rbac/permissions').then((r) => r.data),

  getMyPermissions: (workspaceId?: string) =>
    apiClient
      .get<{ permissions: string[] }>('/rbac/permissions/my', {
        params: workspaceId ? { workspaceId } : undefined,
      })
      .then((r) => r.data),

  getMyWorkspacePermissions: () =>
    apiClient
      .get<MyPermissions>('/rbac/permissions/my/workspaces')
      .then((r) => r.data),
};
