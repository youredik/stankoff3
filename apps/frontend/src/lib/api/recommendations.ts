import { apiClient } from './client';

export interface AssigneeRecommendation {
  userId: string;
  displayName: string;
  score: number;
  reason: string;
  currentWorkload: number;
  avgResponseTimeMinutes: number | null;
}

export interface PriorityRecommendation {
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  reasons: string[];
}

export interface ResponseTimeEstimate {
  estimatedMinutes: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  basedOnSamples: number;
}

export interface SimilarEntity {
  entityId: string;
  customId: string;
  title: string;
  similarity: number;
  resolution?: string;
  status: string;
}

/**
 * Get recommended assignees for an entity
 */
export async function getAssigneeRecommendations(
  workspaceId: string,
  title: string,
  description?: string,
  limit = 5
): Promise<AssigneeRecommendation[]> {
  const params = new URLSearchParams({
    workspaceId,
    title,
    limit: String(limit),
  });
  if (description) {
    params.set('description', description);
  }
  return apiClient
    .get<AssigneeRecommendation[]>(`/recommendations/assignees?${params}`)
    .then((r) => r.data);
}

/**
 * Get priority recommendation
 */
export async function getPriorityRecommendation(
  workspaceId: string,
  title: string,
  description?: string
): Promise<PriorityRecommendation> {
  const params = new URLSearchParams({
    workspaceId,
    title,
  });
  if (description) {
    params.set('description', description);
  }
  return apiClient
    .get<PriorityRecommendation>(`/recommendations/priority?${params}`)
    .then((r) => r.data);
}

/**
 * Estimate response time
 */
export async function estimateResponseTime(
  workspaceId: string,
  title?: string,
  assigneeId?: string
): Promise<ResponseTimeEstimate> {
  const params = new URLSearchParams({ workspaceId });
  if (title) params.set('title', title);
  if (assigneeId) params.set('assigneeId', assigneeId);
  return apiClient
    .get<ResponseTimeEstimate>(`/recommendations/response-time?${params}`)
    .then((r) => r.data);
}

/**
 * Find similar entities
 */
export async function findSimilarEntities(
  workspaceId: string,
  title: string,
  description?: string,
  excludeEntityId?: string,
  limit = 5
): Promise<SimilarEntity[]> {
  const params = new URLSearchParams({
    workspaceId,
    title,
    limit: String(limit),
  });
  if (description) params.set('description', description);
  if (excludeEntityId) params.set('excludeEntityId', excludeEntityId);
  return apiClient
    .get<SimilarEntity[]>(`/recommendations/similar?${params}`)
    .then((r) => r.data);
}

// ==================== AI ASSISTANT ====================

/**
 * Похожий случай из базы знаний (legacy)
 */
export interface SimilarCase {
  requestId: number;
  subject: string;
  resolution?: string;
  similarity: number;
  resolutionTimeHours?: number;
  legacyUrl: string;
  specialists?: string[];
}

/**
 * Рекомендуемый эксперт
 */
export interface SuggestedExpert {
  name: string;
  managerId?: number;
  department?: string;
  relevantCases: number;
  topics: string[];
}

/**
 * Связанный контекст (контрагенты, сделки)
 */
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
}

/**
 * Ответ AI помощника
 */
export interface AiAssistantResponse {
  available: boolean;
  similarCases: SimilarCase[];
  suggestedExperts: SuggestedExpert[];
  relatedContext?: RelatedContext;
  suggestedResponse?: string;
  suggestedActions?: string[];
  keywords?: string[];
}

/**
 * Get AI assistance for an entity
 * Возвращает похожие случаи, экспертов, контекст и рекомендации
 */
export async function getAiAssistance(entityId: string): Promise<AiAssistantResponse> {
  return apiClient
    .get<AiAssistantResponse>(`/ai/assist/${entityId}`)
    .then((r) => r.data);
}
