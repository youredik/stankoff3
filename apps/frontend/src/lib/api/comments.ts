import { apiClient } from './client';
import type { Comment, Attachment } from '@/types';

export const commentsApi = {
  getByEntity: (entityId: string) =>
    apiClient
      .get<Comment[]>(`/comments/entity/${entityId}`)
      .then((r) => r.data),

  create: (
    entityId: string,
    data: { authorId: string; content: string; attachments?: Attachment[] }
  ) =>
    apiClient
      .post<Comment>(`/comments/entity/${entityId}`, data)
      .then((r) => r.data),

  update: (id: string, content: string) =>
    apiClient
      .put<Comment>(`/comments/${id}`, { content })
      .then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/comments/${id}`),
};
