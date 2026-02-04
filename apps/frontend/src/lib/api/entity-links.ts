import { apiClient } from './client';
import type { EntityLink, EntityLinkType, Entity } from '@/types';

export interface CreateLinkDto {
  sourceEntityId: string;
  targetEntityId: string;
  linkType: EntityLinkType;
  metadata?: Record<string, unknown>;
}

export interface CreateLinkedEntityDto {
  sourceEntityId: string;
  linkType: EntityLinkType;
  targetWorkspaceId: string;
  targetEntityData: {
    title: string;
    status: string;
    data?: Record<string, unknown>;
    priority?: 'low' | 'medium' | 'high';
    assigneeId?: string;
  };
  metadata?: Record<string, unknown>;
}

export const entityLinksApi = {
  // Получить связи сущности
  getByEntity: (entityId: string) =>
    apiClient
      .get<EntityLink[]>(`/bpmn/entity-links/entity/${entityId}`)
      .then((r) => r.data),

  // Создать связь
  create: (data: CreateLinkDto) =>
    apiClient.post<EntityLink>('/bpmn/entity-links', data).then((r) => r.data),

  // Удалить связь
  delete: (id: string) =>
    apiClient.delete<void>(`/bpmn/entity-links/${id}`).then((r) => r.data),

  // Создать связанную сущность
  createLinkedEntity: (data: CreateLinkedEntityDto) =>
    apiClient
      .post<{ entity: Entity; link: EntityLink }>(
        '/bpmn/entity-links/create-entity',
        data,
      )
      .then((r) => r.data),
};
