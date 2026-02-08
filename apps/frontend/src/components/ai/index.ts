// AI компоненты для интеграции искусственного интеллекта

export { AiClassificationPanel } from './AiClassificationPanel';
export { AiUsageDashboard } from './AiUsageDashboard';

// Re-export типы и API для удобства
export { aiApi } from '@/lib/api/ai';
export type {
  AiHealthStatus,
  ClassifyRequest,
  ClassifyResponse,
  AiClassification,
  SearchRequest,
  SearchResult,
  AiAssistantResponse,
  IndexerStatus,
  IndexerStats,
  KnowledgeBaseStats,
  GeneratedResponse,
  AiUsageStats,
  AiUsageLog,
} from '@/types/ai';
