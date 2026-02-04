import { apiClient } from './client';
import type {
  SlaDefinition,
  SlaStatusInfo,
  SlaDashboard,
  SlaTargetType,
  SlaInstance,
} from '@/types';

export interface CreateSlaDefinitionDto {
  workspaceId: string;
  name: string;
  description?: string;
  appliesTo: SlaTargetType;
  conditions?: Record<string, unknown>;
  responseTime?: number;
  resolutionTime?: number;
  warningThreshold?: number;
  businessHoursOnly?: boolean;
  businessHours?: {
    start: string;
    end: string;
    timezone: string;
    workdays: number[];
  };
  escalationRules?: Array<{
    threshold: number;
    action: 'notify' | 'escalate';
    targets: string[];
  }>;
  isActive?: boolean;
  priority?: number;
}

export type UpdateSlaDefinitionDto = Partial<Omit<CreateSlaDefinitionDto, 'workspaceId'>>;

// ===================== Definitions =====================

export async function getDefinitions(workspaceId: string): Promise<SlaDefinition[]> {
  const response = await apiClient.get<SlaDefinition[]>('/sla/definitions', {
    params: { workspaceId },
  });
  return response.data;
}

export async function getDefinition(id: string): Promise<SlaDefinition> {
  const response = await apiClient.get<SlaDefinition>(`/sla/definitions/${id}`);
  return response.data;
}

export async function createDefinition(dto: CreateSlaDefinitionDto): Promise<SlaDefinition> {
  const response = await apiClient.post<SlaDefinition>('/sla/definitions', dto);
  return response.data;
}

export async function updateDefinition(
  id: string,
  dto: UpdateSlaDefinitionDto,
): Promise<SlaDefinition> {
  const response = await apiClient.put<SlaDefinition>(`/sla/definitions/${id}`, dto);
  return response.data;
}

export async function deleteDefinition(id: string): Promise<void> {
  await apiClient.delete(`/sla/definitions/${id}`);
}

// ===================== Status =====================

export async function getStatus(
  targetType: SlaTargetType,
  targetId: string,
): Promise<SlaStatusInfo | null> {
  const response = await apiClient.get<SlaStatusInfo | null>(
    `/sla/status/${targetType}/${targetId}`,
  );
  return response.data;
}

export async function getDashboard(workspaceId: string): Promise<SlaDashboard> {
  const response = await apiClient.get<SlaDashboard>('/sla/dashboard', {
    params: { workspaceId },
  });
  return response.data;
}

// ===================== Instance Control =====================

export async function pauseInstance(id: string, reason?: string): Promise<SlaInstance> {
  const response = await apiClient.post<SlaInstance>(`/sla/instances/${id}/pause`, {
    reason,
  });
  return response.data;
}

export async function resumeInstance(id: string): Promise<SlaInstance> {
  const response = await apiClient.post<SlaInstance>(`/sla/instances/${id}/resume`);
  return response.data;
}

// ===================== Helpers =====================

export function formatRemainingTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return '-';
  }

  const isNegative = minutes < 0;
  const absMinutes = Math.abs(minutes);

  if (absMinutes < 60) {
    return `${isNegative ? '-' : ''}${absMinutes}м`;
  }

  if (absMinutes < 1440) {
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;
    return `${isNegative ? '-' : ''}${hours}ч${mins > 0 ? ` ${mins}м` : ''}`;
  }

  const days = Math.floor(absMinutes / 1440);
  const hours = Math.floor((absMinutes % 1440) / 60);
  return `${isNegative ? '-' : ''}${days}д${hours > 0 ? ` ${hours}ч` : ''}`;
}

export function getSlaStatusColor(status: string, usedPercent?: number): string {
  if (status === 'breached') {
    return 'text-red-600 dark:text-red-400';
  }
  if (status === 'met') {
    return 'text-green-600 dark:text-green-400';
  }
  // pending
  if (usedPercent !== undefined && usedPercent >= 80) {
    return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-gray-600 dark:text-gray-400';
}

export function getSlaStatusBgColor(status: string, usedPercent?: number): string {
  if (status === 'breached') {
    return 'bg-red-100 dark:bg-red-900/30';
  }
  if (status === 'met') {
    return 'bg-green-100 dark:bg-green-900/30';
  }
  // pending
  if (usedPercent !== undefined && usedPercent >= 80) {
    return 'bg-amber-100 dark:bg-amber-900/30';
  }
  return 'bg-gray-100 dark:bg-gray-800';
}
