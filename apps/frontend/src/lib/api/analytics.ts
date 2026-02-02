import { apiClient } from './client';

export interface StatusStats {
  status: string;
  statusLabel: string;
  count: number;
  color?: string;
}

export interface PriorityStats {
  priority: string;
  count: number;
}

export interface AssigneeStats {
  assigneeId: string | null;
  firstName: string | null;
  lastName: string | null;
  count: number;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface WorkspaceAnalytics {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  totalEntities: number;
  statusBreakdown: StatusStats[];
  priorityBreakdown: PriorityStats[];
  assigneeBreakdown: AssigneeStats[];
  createdOverTime: TimeSeriesPoint[];
  unassignedCount: number;
  overdueCount: number;
}

export interface GlobalAnalytics {
  totalWorkspaces: number;
  totalEntities: number;
  totalUsers: number;
  entitiesByWorkspace: { workspaceId: string; name: string; icon: string; count: number }[];
  statusBreakdown: StatusStats[];
  priorityBreakdown: PriorityStats[];
  recentActivity: TimeSeriesPoint[];
}

export const analyticsApi = {
  getGlobal: async (): Promise<GlobalAnalytics> => {
    const response = await apiClient.get<GlobalAnalytics>('/analytics/global');
    return response.data;
  },

  getWorkspace: async (workspaceId: string): Promise<WorkspaceAnalytics> => {
    const response = await apiClient.get<WorkspaceAnalytics>(`/analytics/workspace/${workspaceId}`);
    return response.data;
  },
};
