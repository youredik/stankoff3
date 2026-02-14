import { apiClient } from './client';
import type {
  ProcessDefinition,
  ProcessInstance,
  BpmnHealthStatus,
  ProcessDefinitionStatistics,
  WorkspaceProcessStatistics,
  BpmnTemplate,
} from '@/types';

export const bpmnApi = {
  // Health
  getHealth: () =>
    apiClient.get<BpmnHealthStatus>('/bpmn/health').then((r) => r.data),

  // Process Definitions
  getDefinitions: (workspaceId: string) =>
    apiClient
      .get<ProcessDefinition[]>(`/bpmn/definitions/${workspaceId}`)
      .then((r) => r.data),

  getDefinition: (id: string) =>
    apiClient.get<ProcessDefinition>(`/bpmn/definition/${id}`).then((r) => r.data),

  createDefinition: (
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      processId: string;
      bpmnXml: string;
      isDefault?: boolean;
    },
  ) =>
    apiClient
      .post<ProcessDefinition>(`/bpmn/definitions/${workspaceId}`, data)
      .then((r) => r.data),

  deployDefinition: (id: string) =>
    apiClient
      .post<ProcessDefinition>(`/bpmn/definition/${id}/deploy`)
      .then((r) => r.data),

  // Process Instances
  getWorkspaceInstances: (workspaceId: string) =>
    apiClient
      .get<ProcessInstance[]>(`/bpmn/instances/workspace/${workspaceId}`)
      .then((r) => r.data),

  getEntityInstances: (entityId: string) =>
    apiClient
      .get<ProcessInstance[]>(`/bpmn/instances/entity/${entityId}`)
      .then((r) => r.data),

  startInstance: (data: {
    definitionId: string;
    entityId?: string;
    businessKey?: string;
    variables?: Record<string, unknown>;
  }) =>
    apiClient
      .post<ProcessInstance>('/bpmn/instances/start', data)
      .then((r) => r.data),

  // Messages
  sendMessage: (
    messageName: string,
    correlationKey: string,
    variables?: Record<string, unknown>,
  ) =>
    apiClient
      .post<{ success: boolean }>(`/bpmn/message/${messageName}`, {
        correlationKey,
        variables,
      })
      .then((r) => r.data),

  // Statistics
  getDefinitionStatistics: (definitionId: string) =>
    apiClient
      .get<ProcessDefinitionStatistics>(`/bpmn/statistics/definition/${definitionId}`)
      .then((r) => r.data),

  getWorkspaceStatistics: (workspaceId: string) =>
    apiClient
      .get<WorkspaceProcessStatistics>(`/bpmn/statistics/workspace/${workspaceId}`)
      .then((r) => r.data),

  // Instance Management
  cancelInstance: (processInstanceKey: string) =>
    apiClient
      .post<{ success: boolean }>(`/bpmn/instances/${processInstanceKey}/cancel`)
      .then((r) => r.data),

  // Definition Management
  deleteDefinition: (id: string) =>
    apiClient
      .delete<{ success: boolean }>(`/bpmn/definition/${id}`)
      .then((r) => r.data),

  // Templates
  getTemplates: (category?: string) =>
    apiClient
      .get<Omit<BpmnTemplate, 'bpmnXml'>[]>('/bpmn/templates', {
        params: category ? { category } : undefined,
      })
      .then((r) => r.data),

  getTemplateCategories: () =>
    apiClient.get<string[]>('/bpmn/templates/categories').then((r) => r.data),

  getTemplate: (id: string) =>
    apiClient.get<BpmnTemplate>(`/bpmn/templates/${id}`).then((r) => r.data),

  // Process Mining
  getMiningWorkspaceStats: (workspaceId: string) =>
    apiClient
      .get<{
        totalDefinitions: number;
        totalInstances: number;
        avgCompletionRate: number;
        avgDurationMinutes: number;
        topProcessesByVolume: { name: string; count: number }[];
        topProcessesByDuration: { name: string; avgMinutes: number }[];
        statusDistribution: { status: string; count: number }[];
      }>(`/bpmn/mining/workspaces/${workspaceId}/stats`)
      .then((r) => r.data),

  // Incidents count
  getIncidentCount: (workspaceId: string) =>
    apiClient
      .get<{ count: number }>('/bpmn/incidents/count', { params: { workspaceId } })
      .then((r) => r.data),
};
