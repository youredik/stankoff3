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
};
