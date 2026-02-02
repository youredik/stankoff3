import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { WorkspaceEntity } from '../entity/entity.entity';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';

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
  overdueCount: number; // Entities in "new" status older than 7 days
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

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getGlobalAnalytics(workspaceIds: string[]): Promise<GlobalAnalytics> {
    // Count workspaces
    const totalWorkspaces = workspaceIds.length;

    // Count entities in accessible workspaces
    const totalEntities = await this.entityRepository
      .createQueryBuilder('entity')
      .where('entity.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .getCount();

    // Count active users
    const totalUsers = await this.userRepository.count({
      where: { isActive: true },
    });

    // Entities by workspace
    const entitiesByWorkspaceRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.workspaceId', 'workspaceId')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .groupBy('entity.workspaceId')
      .getRawMany();

    // Get workspace info
    const workspaces = await this.workspaceRepository
      .createQueryBuilder('workspace')
      .where('workspace.id IN (:...workspaceIds)', { workspaceIds })
      .getMany();

    const workspaceMap = new Map(workspaces.map(w => [w.id, w]));

    const entitiesByWorkspace = entitiesByWorkspaceRaw.map(row => ({
      workspaceId: row.workspaceId,
      name: workspaceMap.get(row.workspaceId)?.name || 'Unknown',
      icon: workspaceMap.get(row.workspaceId)?.icon || '📋',
      count: parseInt(row.count, 10),
    }));

    // Status breakdown
    const statusBreakdownRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .groupBy('entity.status')
      .getRawMany();

    const statusBreakdown = statusBreakdownRaw.map(row => ({
      status: row.status,
      statusLabel: this.getStatusLabel(row.status, workspaces),
      count: parseInt(row.count, 10),
    }));

    // Priority breakdown
    const priorityBreakdownRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .groupBy('entity.priority')
      .getRawMany();

    const priorityBreakdown = priorityBreakdownRaw.map(row => ({
      priority: row.priority,
      count: parseInt(row.count, 10),
    }));

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivityRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select("DATE(entity.createdAt)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .andWhere('entity.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .groupBy("DATE(entity.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    const recentActivity = recentActivityRaw.map(row => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));

    return {
      totalWorkspaces,
      totalEntities,
      totalUsers,
      entitiesByWorkspace,
      statusBreakdown,
      priorityBreakdown,
      recentActivity,
    };
  }

  async getWorkspaceAnalytics(workspaceId: string): Promise<WorkspaceAnalytics> {
    // Get workspace
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Total entities
    const totalEntities = await this.entityRepository.count({
      where: { workspaceId },
    });

    // Status breakdown with colors
    const statusBreakdownRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId = :workspaceId', { workspaceId })
      .groupBy('entity.status')
      .getRawMany();

    const statusOptions = this.getStatusOptions(workspace);
    const statusBreakdown = statusBreakdownRaw.map(row => {
      const option = statusOptions.find(o => o.id === row.status);
      return {
        status: row.status,
        statusLabel: option?.label || row.status,
        count: parseInt(row.count, 10),
        color: option?.color,
      };
    });

    // Priority breakdown
    const priorityBreakdownRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId = :workspaceId', { workspaceId })
      .groupBy('entity.priority')
      .getRawMany();

    const priorityBreakdown = priorityBreakdownRaw.map(row => ({
      priority: row.priority,
      count: parseInt(row.count, 10),
    }));

    // Assignee breakdown
    const assigneeBreakdownRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .leftJoin('entity.assignee', 'assignee')
      .select('entity.assigneeId', 'assigneeId')
      .addSelect('assignee.firstName', 'firstName')
      .addSelect('assignee.lastName', 'lastName')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId = :workspaceId', { workspaceId })
      .groupBy('entity.assigneeId')
      .addGroupBy('assignee.firstName')
      .addGroupBy('assignee.lastName')
      .getRawMany();

    const assigneeBreakdown = assigneeBreakdownRaw.map(row => ({
      assigneeId: row.assigneeId,
      firstName: row.firstName,
      lastName: row.lastName,
      count: parseInt(row.count, 10),
    }));

    // Created over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const createdOverTimeRaw = await this.entityRepository
      .createQueryBuilder('entity')
      .select("DATE(entity.createdAt)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('entity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('entity.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .groupBy("DATE(entity.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    const createdOverTime = createdOverTimeRaw.map(row => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));

    // Unassigned count
    const unassignedCount = await this.entityRepository.count({
      where: { workspaceId, assigneeId: undefined },
    });

    // Overdue count (new status older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const overdueCount = await this.entityRepository
      .createQueryBuilder('entity')
      .where('entity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('entity.status = :status', { status: 'new' })
      .andWhere('entity.createdAt <= :sevenDaysAgo', { sevenDaysAgo })
      .getCount();

    return {
      workspaceId,
      workspaceName: workspace.name,
      workspaceIcon: workspace.icon,
      totalEntities,
      statusBreakdown,
      priorityBreakdown,
      assigneeBreakdown,
      createdOverTime,
      unassignedCount,
      overdueCount,
    };
  }

  private getStatusOptions(workspace: Workspace): { id: string; label: string; color?: string }[] {
    if (!workspace.sections) return [];

    for (const section of workspace.sections) {
      const statusField = section.fields?.find(f => f.type === 'status');
      if (statusField?.options) {
        return statusField.options;
      }
    }

    return [];
  }

  private getStatusLabel(statusId: string, workspaces: Workspace[]): string {
    for (const workspace of workspaces) {
      const options = this.getStatusOptions(workspace);
      const option = options.find(o => o.id === statusId);
      if (option) return option.label;
    }
    return statusId;
  }
}
