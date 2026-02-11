import { apiClient } from './client';
import type { Comment, UploadedAttachment } from '@/types';

// Backend expects attachments with key/thumbnailKey
interface CreateCommentData {
  content: string;
  attachments?: {
    id: string;
    name: string;
    size: number;
    key: string;
    mimeType: string;
    thumbnailKey?: string;
  }[];
}

export const commentsApi = {
  getByEntity: (entityId: string) =>
    apiClient
      .get<Comment[]>(`/comments/entity/${entityId}`)
      .then((r) => r.data),

  create: (
    entityId: string,
    data: { content: string; attachments?: UploadedAttachment[] }
  ) => {
    // Map UploadedAttachment to backend DTO format (remove url/thumbnailUrl)
    const payload: CreateCommentData = {
      content: data.content,
      attachments: data.attachments?.map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        key: att.key,
        mimeType: att.mimeType,
        thumbnailKey: att.thumbnailKey,
      })),
    };
    return apiClient
      .post<Comment>(`/comments/entity/${entityId}`, payload)
      .then((r) => r.data);
  },

  update: (id: string, content: string) =>
    apiClient
      .put<Comment>(`/comments/${id}`, { content })
      .then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/comments/${id}`),
};
