import { apiClient } from './client';

export interface IncidentInfo {
  id: string;
  processInstanceKey: string;
  processDefinitionKey: string;
  definitionName?: string;
  entityId?: string;
  entityTitle?: string;
  entityCustomId?: string;
  workspaceId: string;
  errorMessage?: string;
  startedAt: string;
  updatedAt: string;
  variables: Record<string, unknown>;
}

export const incidentsApi = {
  getIncidents: (workspaceId: string) =>
    apiClient
      .get<IncidentInfo[]>('/bpmn/incidents', { params: { workspaceId } })
      .then((r) => r.data),

  getIncidentCount: (workspaceId: string) =>
    apiClient
      .get<{ count: number }>('/bpmn/incidents/count', { params: { workspaceId } })
      .then((r) => r.data.count),

  retryIncident: (id: string) =>
    apiClient.post(`/bpmn/incidents/${id}/retry`).then((r) => r.data),

  cancelIncident: (id: string) =>
    apiClient.post(`/bpmn/incidents/${id}/cancel`).then((r) => r.data),
};
