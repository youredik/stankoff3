import { apiClient } from './client';

export interface ProcessMiningStats {
  definitionId: string;
  definitionName: string;
  totalInstances: number;
  completedInstances: number;
  activeInstances: number;
  terminatedInstances: number;
  incidentInstances: number;
  avgDurationMinutes: number | null;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  medianDurationMinutes: number | null;
  completionRate: number;
  instancesByDay: { date: string; count: number }[];
  durationDistribution: { bucket: string; count: number }[];
}

export interface TimeAnalysis {
  dayOfWeekStats: { day: string; avgInstances: number; avgDuration: number }[];
  hourlyStats: { hour: number; avgInstances: number }[];
  trendLine: { date: string; instances: number; avgDuration: number }[];
}

export interface ElementStatItem {
  elementId: string;
  elementType: string;
  executionCount: number;
  successCount: number;
  failedCount: number;
  avgDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
}

export interface ElementStats {
  elements: ElementStatItem[];
}

export interface WorkspaceProcessStats {
  totalDefinitions: number;
  totalInstances: number;
  avgCompletionRate: number;
  avgDurationMinutes: number;
  topProcessesByVolume: { name: string; count: number }[];
  topProcessesByDuration: { name: string; avgMinutes: number }[];
  statusDistribution: { status: string; count: number }[];
}

/**
 * Get detailed statistics for a specific process definition
 */
export async function getProcessStats(
  definitionId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ProcessMiningStats> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString();
  return apiClient
    .get<ProcessMiningStats>(
      `/bpmn/mining/definitions/${definitionId}/stats${query ? `?${query}` : ''}`
    )
    .then((r) => r.data);
}

/**
 * Get time-based analysis for a process definition
 */
export async function getTimeAnalysis(
  definitionId: string,
  startDate?: Date,
  endDate?: Date
): Promise<TimeAnalysis> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString();
  return apiClient
    .get<TimeAnalysis>(
      `/bpmn/mining/definitions/${definitionId}/time-analysis${query ? `?${query}` : ''}`
    )
    .then((r) => r.data);
}

/**
 * Get per-element execution statistics for heat map
 */
export async function getElementStats(
  definitionId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ElementStats> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString();
  return apiClient
    .get<ElementStats>(
      `/bpmn/mining/definitions/${definitionId}/element-stats${query ? `?${query}` : ''}`
    )
    .then((r) => r.data);
}

/**
 * Get workspace-wide process mining statistics
 */
export async function getWorkspaceStats(
  workspaceId: string,
  startDate?: Date,
  endDate?: Date
): Promise<WorkspaceProcessStats> {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate.toISOString());
  if (endDate) params.set('endDate', endDate.toISOString());
  const query = params.toString();
  return apiClient
    .get<WorkspaceProcessStats>(
      `/bpmn/mining/workspaces/${workspaceId}/stats${query ? `?${query}` : ''}`
    )
    .then((r) => r.data);
}
