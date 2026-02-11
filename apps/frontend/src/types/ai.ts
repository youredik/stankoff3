// Типы для AI модуля

// ==================== Classification ====================

export interface ClassifyRequest {
  title: string;
  description: string;
  workspaceId?: string;
  equipment?: string;
}

export interface ClassifyResponse {
  category: string;
  priority: string;
  skills: string[];
  confidence: number;
  reasoning: string;
  suggestedAssignee?: string;
  provider?: string;
  model?: string;
}

export interface AiClassification {
  id: string;
  entityId: string;
  category: string;
  priority: string;
  skills: string[];
  confidence: number;
  reasoning: string;
  provider: string;
  model: string;
  applied: boolean;
  appliedAt?: string;
  appliedById?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== Search / RAG ====================

export interface SearchRequest {
  query: string;
  workspaceId?: string;
  sourceType?: string;
  limit?: number;
  minSimilarity?: number;
}

export interface SearchResultItem {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  similarity: number;
  legacyUrl?: string;
}

export interface SuggestedExpert {
  name: string;
  managerId?: number;
  department?: string;
  relevantCases: number;
  topics: string[];
}

export interface SearchResult {
  results: SearchResultItem[];
  generatedAnswer?: string;
  relatedLinks?: Array<{
    label: string;
    url: string;
    sourceType: string;
  }>;
  suggestedExperts?: SuggestedExpert[];
}

// ==================== AI Assistant ====================

export interface SimilarCase {
  requestId: number;
  subject: string;
  resolution?: string;
  similarity: number;
  resolutionTimeHours?: number;
  legacyUrl: string;
  specialists?: string[];
}

export interface RelatedContext {
  counterpartyName?: string;
  counterpartyUrl?: string;
  deals?: Array<{
    id: number;
    name: string;
    sum: number;
    url: string;
  }>;
  customerTotalRequests?: number;
  avgResolutionTimeHours?: number;
  topCategories?: string[];
}

export interface AiAssistantResponse {
  available: boolean;
  similarCases: SimilarCase[];
  suggestedExperts: SuggestedExpert[];
  relatedContext?: RelatedContext;
  suggestedResponse?: string;
  suggestedActions?: string[];
  keywords?: string[];
  sentiment?: {
    label: string;
    emoji: string;
    score: number;
  };
}

export interface ConversationSummary {
  summary: string;
  commentCount: number;
}

export interface GeneratedResponse {
  draft: string;
  sources: Array<{
    type: string;
    id: string;
    title?: string;
    similarity?: number;
  }>;
}

// ==================== Health & Stats ====================

export interface AiHealthStatus {
  available: boolean;
  providers: {
    openai: boolean;
    ollama?: boolean;
    groq?: boolean;
  };
}

export interface IndexerStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  processedRequests?: number;
  totalChunks?: number;
  failedRequests?: number;
  startTime?: string;
  error?: string;
}

export interface IndexerStats {
  legacy: {
    totalRequests: number;
    closedRequests: number;
    totalAnswers: number;
    averageAnswersPerRequest: number;
  };
  knowledgeBase: {
    totalChunks: number;
    bySourceType: Record<string, number>;
  };
  coverage: {
    indexedRequests: number;
    percentage: number;
  };
}

export interface KnowledgeBaseStats {
  totalChunks: number;
  bySourceType: Record<string, number>;
}

// ==================== Usage Stats ====================

export interface AiUsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate: number;
  byProvider: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    avgLatency: number;
  }>;
  byOperation: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

export interface AiUsageLog {
  id: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  createdAt: string;
  userName?: string;
}

// ==================== AI Notifications ====================

export type AiNotificationType =
  | 'cluster_detected'
  | 'critical_entity'
  | 'sla_risk'
  | 'duplicate_suspected'
  | 'trend_anomaly';

export interface AiNotificationItem {
  id: string;
  type: AiNotificationType;
  title: string;
  message: string;
  workspaceId: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  confidence: number;
  targetUserId: string | null;
  read: boolean;
  dismissed: boolean;
  createdAt: string;
}

// ==================== Knowledge Graph ====================

export interface GraphNode {
  id: string;
  type: 'entity' | 'legacy_request' | 'expert' | 'counterparty' | 'topic';
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'similar_to' | 'assigned_to' | 'related_to' | 'belongs_to';
  weight: number;
  label?: string;
}

export interface KnowledgeGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId: string;
}
