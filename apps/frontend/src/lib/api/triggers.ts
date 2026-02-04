import { apiClient } from './client';
import type {
  ProcessTrigger,
  TriggerExecution,
  TriggerType,
  TriggerConditions,
  VariableMappings,
} from '@/types';

export interface CreateTriggerDto {
  processDefinitionId: string;
  workspaceId: string;
  triggerType: TriggerType;
  name?: string;
  description?: string;
  conditions?: TriggerConditions;
  variableMappings?: VariableMappings;
  isActive?: boolean;
}

export interface UpdateTriggerDto {
  name?: string;
  description?: string;
  conditions?: TriggerConditions;
  variableMappings?: VariableMappings;
  isActive?: boolean;
}

export const triggersApi = {
  // Получить триггеры workspace
  getByWorkspace: (workspaceId: string) =>
    apiClient
      .get<ProcessTrigger[]>(`/bpmn/triggers/workspace/${workspaceId}`)
      .then((r) => r.data),

  // Получить один триггер
  getOne: (id: string) =>
    apiClient.get<ProcessTrigger>(`/bpmn/triggers/${id}`).then((r) => r.data),

  // Создать триггер
  create: (data: CreateTriggerDto) =>
    apiClient.post<ProcessTrigger>('/bpmn/triggers', data).then((r) => r.data),

  // Обновить триггер
  update: (id: string, data: UpdateTriggerDto) =>
    apiClient
      .put<ProcessTrigger>(`/bpmn/triggers/${id}`, data)
      .then((r) => r.data),

  // Удалить триггер
  delete: (id: string) =>
    apiClient.delete<void>(`/bpmn/triggers/${id}`).then((r) => r.data),

  // Включить/выключить триггер
  toggle: (id: string) =>
    apiClient
      .post<ProcessTrigger>(`/bpmn/triggers/${id}/toggle`)
      .then((r) => r.data),

  // История выполнений триггера
  getExecutions: (triggerId: string, limit = 50) =>
    apiClient
      .get<TriggerExecution[]>(`/bpmn/triggers/${triggerId}/executions`, {
        params: { limit },
      })
      .then((r) => r.data),
};
