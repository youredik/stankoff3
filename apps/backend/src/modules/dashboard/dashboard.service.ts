import { Injectable } from '@nestjs/common';
import { UserTasksService } from '../bpmn/user-tasks/user-tasks.service';
import { SlaService } from '../sla/sla.service';
import { ProcessMiningService } from '../bpmn/process-mining/process-mining.service';
import { WorkspaceService } from '../workspace/workspace.service';

export interface WorkspaceSummary {
  workspaceId: string;
  workspaceName: string;
  taskStats: {
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
    avgCompletionTimeMs: number | null;
  } | null;
  sla: {
    total: number;
    pending: number;
    met: number;
    breached: number;
    atRisk: number;
  } | null;
  processStats: {
    totalDefinitions: number;
    totalInstances: number;
    avgCompletionRate: number;
    avgDurationMinutes: number;
    statusDistribution: { status: string; count: number }[];
  } | null;
}

export interface DashboardSummaryResponse {
  inboxCount: number;
  summaries: WorkspaceSummary[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly userTasksService: UserTasksService,
    private readonly slaService: SlaService,
    private readonly processMiningService: ProcessMiningService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async getSummary(userId: string): Promise<DashboardSummaryResponse> {
    // Получаем workspaces и inbox count параллельно
    const [workspaces, inboxResult] = await Promise.all([
      this.workspaceService.findAll(userId),
      this.userTasksService.getInbox(userId, undefined, false, {
        page: 1,
        perPage: 1,
      }),
    ]);

    const activeWorkspaces = workspaces.filter(
      (w) => !w.isArchived && !w.isSystem,
    );

    // Собираем данные по всем workspaces параллельно (внутри бэкенда — без rate limit)
    const summaries = await Promise.all(
      activeWorkspaces.map(async (workspace) => {
        const [taskStats, sla, processStats] = await Promise.allSettled([
          this.userTasksService.getTaskStatistics(workspace.id),
          this.slaService.getDashboard(workspace.id),
          this.processMiningService.getWorkspaceStats(workspace.id),
        ]);

        return {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          taskStats:
            taskStats.status === 'fulfilled' ? taskStats.value : null,
          sla: sla.status === 'fulfilled' ? sla.value : null,
          processStats:
            processStats.status === 'fulfilled'
              ? {
                  totalDefinitions: processStats.value.totalDefinitions,
                  totalInstances: processStats.value.totalInstances,
                  avgCompletionRate: processStats.value.avgCompletionRate,
                  avgDurationMinutes: processStats.value.avgDurationMinutes,
                  statusDistribution:
                    processStats.value.statusDistribution,
                }
              : null,
        } as WorkspaceSummary;
      }),
    );

    return {
      inboxCount: inboxResult.total,
      summaries,
    };
  }
}
