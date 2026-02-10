import { apiClient } from './client';
import type {
  ChatConversation,
  ChatMessage,
  ChatMessagesPage,
  ChatMessageAttachment,
} from '@/types';

export const chatApi = {
  // ─── Conversations ────────────────────────────────────

  getConversations: (search?: string) =>
    apiClient
      .get<ChatConversation[]>('/chat/conversations', { params: { search } })
      .then((r) => r.data),

  createConversation: (data: {
    type: 'direct' | 'group' | 'entity';
    name?: string;
    entityId?: string;
    participantIds: string[];
  }) =>
    apiClient
      .post<ChatConversation>('/chat/conversations', data)
      .then((r) => r.data),

  getConversation: (id: string) =>
    apiClient
      .get<ChatConversation>(`/chat/conversations/${id}`)
      .then((r) => r.data),

  getEntityConversation: (entityId: string) =>
    apiClient
      .get<ChatConversation | null>(`/chat/conversations/for-entity/${entityId}`)
      .then((r) => r.data),

  getUnreadCounts: () =>
    apiClient
      .get<Record<string, number>>('/chat/unread-counts')
      .then((r) => r.data),

  searchMessages: (q: string) =>
    apiClient
      .get<ChatMessage[]>('/chat/search', { params: { q } })
      .then((r) => r.data),

  // ─── Messages ─────────────────────────────────────────

  getMessages: (conversationId: string, cursor?: string, limit?: number) =>
    apiClient
      .get<ChatMessagesPage>(`/chat/conversations/${conversationId}/messages`, {
        params: { cursor, limit },
      })
      .then((r) => r.data),

  sendMessage: (
    conversationId: string,
    data: {
      content?: string;
      type?: 'text' | 'voice';
      replyToId?: string;
      attachments?: ChatMessageAttachment[];
      voiceKey?: string;
      voiceDuration?: number;
      voiceWaveform?: number[];
      mentionedUserIds?: string[];
    },
  ) =>
    apiClient
      .post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, data)
      .then((r) => r.data),

  editMessage: (conversationId: string, messageId: string, content: string) =>
    apiClient
      .patch<ChatMessage>(
        `/chat/conversations/${conversationId}/messages/${messageId}`,
        { content },
      )
      .then((r) => r.data),

  deleteMessage: (conversationId: string, messageId: string) =>
    apiClient
      .delete(`/chat/conversations/${conversationId}/messages/${messageId}`)
      .then((r) => r.data),

  // ─── Read status ──────────────────────────────────────

  markAsRead: (conversationId: string, lastReadMessageId: string) =>
    apiClient
      .post(`/chat/conversations/${conversationId}/read`, { lastReadMessageId })
      .then((r) => r.data),

  // ─── Participants ─────────────────────────────────────

  addParticipants: (conversationId: string, userIds: string[]) =>
    apiClient
      .post<ChatConversation>(
        `/chat/conversations/${conversationId}/participants`,
        { userIds },
      )
      .then((r) => r.data),

  removeParticipant: (conversationId: string, userId: string) =>
    apiClient
      .delete(`/chat/conversations/${conversationId}/participants/${userId}`)
      .then((r) => r.data),
};
