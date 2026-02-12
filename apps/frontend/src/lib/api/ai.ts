import { apiClient } from './client';
import type {
  AiHealthStatus,
  ClassifyRequest,
  ClassifyResponse,
  AiClassification,
  SearchRequest,
  SearchResult,
  AiAssistantResponse,
  ConversationSummary,
  IndexerStatus,
  IndexerStats,
  KnowledgeBaseStats,
  GeneratedResponse,
  AiUsageStats,
  AiUsageLog,
  AiNotificationItem,
  KnowledgeGraphResponse,
} from '@/types/ai';

/**
 * API клиент для AI модуля
 */
export const aiApi = {
  // ==================== Health ====================

  /**
   * Проверка статуса AI сервиса
   */
  getHealth: () =>
    apiClient.get<AiHealthStatus>('/ai/health').then((r) => r.data),

  // ==================== Classification ====================

  /**
   * Классификация заявки (без сохранения)
   */
  classify: (data: ClassifyRequest) =>
    apiClient.post<ClassifyResponse>('/ai/classify', data).then((r) => r.data),

  /**
   * Классификация и сохранение для entity
   */
  classifyAndSave: (entityId: string, data: ClassifyRequest) =>
    apiClient.post<AiClassification>(`/ai/classify/${entityId}`, data).then((r) => r.data),

  /**
   * Получить сохранённую классификацию
   */
  getClassification: (entityId: string) =>
    apiClient.get<AiClassification | null>(`/ai/classification/${entityId}`).then((r) => r.data),

  /**
   * Применить классификацию к entity
   */
  applyClassification: (entityId: string) =>
    apiClient.post<AiClassification>(`/ai/classification/${entityId}/apply`).then((r) => r.data),

  // ==================== Search / RAG ====================

  /**
   * RAG поиск по базе знаний
   */
  search: (data: SearchRequest) =>
    apiClient.post<SearchResult>('/ai/search', data).then((r) => r.data),

  /**
   * Статистика базы знаний
   */
  getKnowledgeBaseStats: (workspaceId?: string) => {
    const params = workspaceId ? `?workspaceId=${workspaceId}` : '';
    return apiClient.get<KnowledgeBaseStats>(`/ai/knowledge-base/stats${params}`).then((r) => r.data);
  },

  // ==================== AI Assistant ====================

  /**
   * Получить AI помощь для entity
   */
  getAssistance: (entityId: string) =>
    apiClient.get<AiAssistantResponse>(`/ai/assist/${entityId}`).then((r) => r.data),

  /**
   * Сгенерировать черновик ответа для entity
   */
  suggestResponse: (entityId: string, additionalContext?: string) =>
    apiClient.post<GeneratedResponse>(`/ai/assist/${entityId}/suggest-response`, { additionalContext }).then((r) => r.data),

  /**
   * Получить AI-резюме переписки
   */
  getSummary: (entityId: string) =>
    apiClient.get<ConversationSummary>(`/ai/assist/${entityId}/summary`).then((r) => r.data),

  // ==================== Indexer ====================

  /**
   * Проверка статуса RAG индексатора
   */
  getIndexerHealth: () =>
    apiClient.get<{
      available: boolean;
      services: { openai: boolean; legacy: boolean };
    }>('/ai/indexer/health').then((r) => r.data),

  /**
   * Текущий статус индексации
   */
  getIndexerStatus: () =>
    apiClient.get<IndexerStatus>('/ai/indexer/status').then((r) => r.data),

  /**
   * Статистика индексации
   */
  getIndexerStats: () =>
    apiClient.get<IndexerStats>('/ai/indexer/stats').then((r) => r.data),

  /**
   * Запустить индексацию legacy данных
   */
  startIndexing: (options?: { batchSize?: number; maxRequests?: number }) =>
    apiClient.post<{ message: string; status: IndexerStatus }>('/ai/indexer/start', options || {}).then((r) => r.data),

  /**
   * Переиндексировать конкретную заявку
   */
  reindexRequest: (requestId: number) =>
    apiClient.post<{
      requestId: number;
      chunksCreated: number;
      success: boolean;
      error?: string;
    }>(`/ai/indexer/reindex/${requestId}`).then((r) => r.data),

  // ==================== Usage Stats ====================

  /**
   * Получить статистику использования AI
   */
  getUsageStats: (options?: { days?: number; provider?: string; operation?: string }) => {
    const params = new URLSearchParams();
    if (options?.days) params.append('days', String(options.days));
    if (options?.provider) params.append('provider', options.provider);
    if (options?.operation) params.append('operation', options.operation);
    const query = params.toString();
    return apiClient.get<AiUsageStats>(`/ai/usage/stats${query ? `?${query}` : ''}`).then((r) => r.data);
  },

  /**
   * Получить последние логи использования AI
   */
  getUsageLogs: (options?: { limit?: number; provider?: string; operation?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.provider) params.append('provider', options.provider);
    if (options?.operation) params.append('operation', options.operation);
    const query = params.toString();
    return apiClient.get<AiUsageLog[]>(`/ai/usage/logs${query ? `?${query}` : ''}`).then((r) => r.data);
  },

  // ==================== AI Notifications ====================

  getNotifications: (options?: { workspaceId?: string; unreadOnly?: boolean; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (options?.workspaceId) params.append('workspaceId', options.workspaceId);
    if (options?.unreadOnly) params.append('unreadOnly', 'true');
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    const query = params.toString();
    return apiClient.get<{ notifications: AiNotificationItem[]; total: number }>(`/ai/notifications${query ? `?${query}` : ''}`).then((r) => r.data);
  },

  getNotificationUnreadCount: (workspaceId?: string) => {
    const params = workspaceId ? `?workspaceId=${workspaceId}` : '';
    return apiClient.get<{ count: number }>(`/ai/notifications/unread-count${params}`).then((r) => r.data);
  },

  markNotificationRead: (id: string) =>
    apiClient.patch<{ success: boolean }>(`/ai/notifications/${id}/read`).then((r) => r.data),

  markAllNotificationsRead: (workspaceId?: string) =>
    apiClient.post<{ success: boolean }>('/ai/notifications/mark-all-read', { workspaceId }).then((r) => r.data),

  dismissNotification: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/ai/notifications/${id}`).then((r) => r.data),

  toggleNotifications: (enabled: boolean) =>
    apiClient.post<{ enabled: boolean }>('/ai/notifications/toggle', { enabled }).then((r) => r.data),

  // ==================== Knowledge Graph ====================

  getKnowledgeGraph: (entityId: string) =>
    apiClient.get<KnowledgeGraphResponse>(`/ai/knowledge-graph/${entityId}`).then((r) => r.data),

  // ==================== Feedback ====================

  submitFeedback: (data: {
    type: string;
    entityId?: string;
    rating: string;
    metadata?: Record<string, unknown>;
  }) => apiClient.post('/ai/feedback', data).then((r) => r.data),

  getFeedbackStats: (options?: { type?: string; days?: number }) => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.days) params.append('days', String(options.days));
    const query = params.toString();
    return apiClient.get<{
      totalPositive: number;
      totalNegative: number;
      byType: Record<string, { positive: number; negative: number }>;
      satisfactionRate: number;
    }>(`/ai/feedback/stats${query ? `?${query}` : ''}`).then((r) => r.data);
  },

  getEntityFeedback: (entityId: string) =>
    apiClient.get<Array<{ id: string; type: string; rating: string; metadata: Record<string, unknown> }>>(`/ai/feedback/entity/${entityId}`).then((r) => r.data),
};
