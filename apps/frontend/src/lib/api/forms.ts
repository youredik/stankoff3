import { apiClient } from './client';
import type { FormDefinition } from '@/types';

export interface CreateFormDefinitionDto {
  workspaceId: string;
  key: string;
  name: string;
  description?: string;
  schema: Record<string, any>;
  uiSchema?: Record<string, any>;
}

export type UpdateFormDefinitionDto = Partial<
  Omit<CreateFormDefinitionDto, 'workspaceId'>
> & {
  isActive?: boolean;
};

export async function getFormDefinitions(
  workspaceId: string,
): Promise<FormDefinition[]> {
  const response = await apiClient.get<FormDefinition[]>('/bpmn/forms', {
    params: { workspaceId },
  });
  return response.data;
}

export async function getFormDefinition(id: string): Promise<FormDefinition> {
  const response = await apiClient.get<FormDefinition>(`/bpmn/forms/${id}`);
  return response.data;
}

export async function createFormDefinition(
  dto: CreateFormDefinitionDto,
): Promise<FormDefinition> {
  const response = await apiClient.post<FormDefinition>('/bpmn/forms', dto);
  return response.data;
}

export async function updateFormDefinition(
  id: string,
  dto: UpdateFormDefinitionDto,
): Promise<FormDefinition> {
  const response = await apiClient.put<FormDefinition>(
    `/bpmn/forms/${id}`,
    dto,
  );
  return response.data;
}

export async function deleteFormDefinition(id: string): Promise<void> {
  await apiClient.delete(`/bpmn/forms/${id}`);
}
