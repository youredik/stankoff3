import { apiClient } from './client';
import type { MenuSection, MenuSectionMember, MenuSectionRole } from '@/types';

export const sectionsApi = {
  getAll: () => apiClient.get<MenuSection[]>('/sections').then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<MenuSection>(`/sections/${id}`).then((r) => r.data),

  create: (data: { name: string; description?: string; icon?: string; order?: number }) =>
    apiClient.post<MenuSection>('/sections', data).then((r) => r.data),

  update: (id: string, data: { name?: string; description?: string; icon?: string; order?: number }) =>
    apiClient.put<MenuSection>(`/sections/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/sections/${id}`),

  // Изменить порядок разделов
  reorder: (sectionIds: string[]) =>
    apiClient.post('/sections/reorder', { sectionIds }),

  // Получить роли текущего пользователя во всех разделах
  getMyRoles: () =>
    apiClient.get<Record<string, MenuSectionRole>>('/sections/my-roles').then((r) => r.data),

  // Управление участниками
  getMembers: (sectionId: string) =>
    apiClient.get<MenuSectionMember[]>(`/sections/${sectionId}/members`).then((r) => r.data),

  addMember: (sectionId: string, userId: string, role?: MenuSectionRole) =>
    apiClient
      .post<MenuSectionMember>(`/sections/${sectionId}/members`, { userId, role })
      .then((r) => r.data),

  updateMemberRole: (sectionId: string, userId: string, role: MenuSectionRole) =>
    apiClient
      .put<MenuSectionMember>(`/sections/${sectionId}/members/${userId}`, { role })
      .then((r) => r.data),

  removeMember: (sectionId: string, userId: string) =>
    apiClient.delete(`/sections/${sectionId}/members/${userId}`),
};
