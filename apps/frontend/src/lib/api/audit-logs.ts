import { apiClient } from './client';
import type { AuditLog, AuditActionType } from '@/types';

export interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  hasMore: boolean;
}

export interface AuditLogFilters {
  action?: AuditActionType;
  entityId?: string;
  actorId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sort?: 'newest' | 'oldest';
}

export async function getEntityHistory(
  entityId: string,
  options: PaginationOptions = {},
): Promise<AuditLogResponse> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.sort) params.set('sort', options.sort);

  const response = await apiClient.get<AuditLogResponse>(
    `/audit-logs/entity/${entityId}?${params.toString()}`,
  );
  return response.data;
}

export async function getWorkspaceHistory(
  workspaceId: string,
  filters: AuditLogFilters = {},
  options: PaginationOptions = {},
): Promise<AuditLogResponse> {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.entityId) params.set('entityId', filters.entityId);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.sort) params.set('sort', options.sort);

  const response = await apiClient.get<AuditLogResponse>(
    `/audit-logs/workspace/${workspaceId}?${params.toString()}`,
  );
  return response.data;
}
