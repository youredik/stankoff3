import { apiClient } from './client';
import type {
  ProcessDefinition,
  ProcessInstance,
  BpmnHealthStatus,
  ProcessDefinitionStatistics,
  WorkspaceProcessStatistics,
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
};
