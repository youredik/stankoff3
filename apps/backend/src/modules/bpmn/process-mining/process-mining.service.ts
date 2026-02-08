import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from '../entities/process-instance.entity';
import { ProcessDefinition } from '../entities/process-definition.entity';
import { ProcessActivityLog } from '../entities/process-activity-log.entity';
import { UserTask } from '../entities/user-task.entity';

// Типы для Process Mining аналитики
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

export interface ProcessFlowStats {
  totalPaths: number;
  variants: ProcessVariant[];
  avgPathLength: number;
  bottlenecks: Bottleneck[];
}

export interface ProcessVariant {
  id: string;
  path: string[];
  instanceCount: number;
  percentOfTotal: number;
  avgDurationMinutes: number;
}

export interface Bottleneck {
  activityId: string;
  activityName: string;
  avgWaitTimeMinutes: number;
  instancesAffected: number;
  severity: 'low' | 'medium' | 'high';
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

export interface SlaComplianceStats {
  totalWithSla: number;
  metOnTime: number;
  breached: number;
  atRisk: number;
  complianceRate: number;
  avgSlackMinutes: number;
}

@Injectable()
export class ProcessMiningService {
  private readonly logger = new Logger(ProcessMiningService.name);

  constructor(
    @InjectRepository(ProcessInstance)
    private instanceRepository: Repository<ProcessInstance>,
    @InjectRepository(ProcessDefinition)
    private definitionRepository: Repository<ProcessDefinition>,
    @InjectRepository(ProcessActivityLog)
    private activityLogRepository: Repository<ProcessActivityLog>,
    @InjectRepository(UserTask)
    private userTaskRepository: Repository<UserTask>,
  ) {}

  /**
   * Get comprehensive statistics for a process definition
   */
  async getProcessStats(
    definitionId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ProcessMiningStats> {
    const definition = await this.definitionRepository.findOne({
      where: { id: definitionId },
    });

    if (!definition) {
      throw new Error(`Process definition ${definitionId} not found`);
    }

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (startDate && endDate) {
      dateFilter.startedAt = Between(startDate, endDate);
    } else if (startDate) {
      dateFilter.startedAt = MoreThanOrEqual(startDate);
    } else if (endDate) {
      dateFilter.startedAt = LessThanOrEqual(endDate);
    }

    const instances = await this.instanceRepository.find({
      where: {
        processDefinitionId: definitionId,
        ...dateFilter,
      },
      order: { startedAt: 'ASC' },
    });

    const totalInstances = instances.length;
    const completedInstances = instances.filter(
      (i) => i.status === ProcessInstanceStatus.COMPLETED,
    ).length;
    const activeInstances = instances.filter(
      (i) => i.status === ProcessInstanceStatus.ACTIVE,
    ).length;
    const terminatedInstances = instances.filter(
      (i) => i.status === ProcessInstanceStatus.TERMINATED,
    ).length;
    const incidentInstances = instances.filter(
      (i) => i.status === ProcessInstanceStatus.INCIDENT,
    ).length;

    // Calculate durations for completed instances
    const durations = instances
      .filter((i) => i.status === ProcessInstanceStatus.COMPLETED && i.completedAt)
      .map((i) => {
        const duration =
          (i.completedAt!.getTime() - i.startedAt.getTime()) / 60000; // in minutes
        return duration;
      })
      .sort((a, b) => a - b);

    const avgDurationMinutes =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;

    const minDurationMinutes = durations.length > 0 ? durations[0] : null;
    const maxDurationMinutes =
      durations.length > 0 ? durations[durations.length - 1] : null;
    const medianDurationMinutes =
      durations.length > 0
        ? durations.length % 2 === 0
          ? (durations[durations.length / 2 - 1] +
              durations[durations.length / 2]) /
            2
          : durations[Math.floor(durations.length / 2)]
        : null;

    const completionRate =
      totalInstances > 0 ? (completedInstances / totalInstances) * 100 : 0;

    // Group instances by day
    const instancesByDay = this.groupByDay(instances);

    // Create duration distribution buckets
    const durationDistribution = this.createDurationDistribution(durations);

    return {
      definitionId,
      definitionName: definition.name,
      totalInstances,
      completedInstances,
      activeInstances,
      terminatedInstances,
      incidentInstances,
      avgDurationMinutes: avgDurationMinutes
        ? Math.round(avgDurationMinutes * 100) / 100
        : null,
      minDurationMinutes: minDurationMinutes
        ? Math.round(minDurationMinutes * 100) / 100
        : null,
      maxDurationMinutes: maxDurationMinutes
        ? Math.round(maxDurationMinutes * 100) / 100
        : null,
      medianDurationMinutes: medianDurationMinutes
        ? Math.round(medianDurationMinutes * 100) / 100
        : null,
      completionRate: Math.round(completionRate * 100) / 100,
      instancesByDay,
      durationDistribution,
    };
  }

  /**
   * Get time-based analysis for process execution patterns
   */
  async getTimeAnalysis(
    definitionId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TimeAnalysis> {
    const instances = await this.instanceRepository.find({
      where: {
        processDefinitionId: definitionId,
        ...(startDate && endDate ? { startedAt: Between(startDate, endDate) } : {}),
      },
    });

    // Day of week analysis
    const dayOfWeekMap = new Map<number, { count: number; totalDuration: number }>();
    for (let i = 0; i < 7; i++) {
      dayOfWeekMap.set(i, { count: 0, totalDuration: 0 });
    }

    // Hour of day analysis
    const hourlyMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      hourlyMap.set(i, 0);
    }

    // Process each instance
    for (const instance of instances) {
      const dayOfWeek = instance.startedAt.getDay();
      const hour = instance.startedAt.getHours();

      // Update day stats
      const dayData = dayOfWeekMap.get(dayOfWeek)!;
      dayData.count++;
      if (instance.completedAt) {
        const duration =
          (instance.completedAt.getTime() - instance.startedAt.getTime()) / 60000;
        dayData.totalDuration += duration;
      }

      // Update hourly stats
      hourlyMap.set(hour, hourlyMap.get(hour)! + 1);
    }

    const dayNames = [
      'Воскресенье',
      'Понедельник',
      'Вторник',
      'Среда',
      'Четверг',
      'Пятница',
      'Суббота',
    ];

    const dayOfWeekStats = Array.from(dayOfWeekMap.entries()).map(([day, data]) => ({
      day: dayNames[day],
      avgInstances: Math.round(data.count * 100) / 100,
      avgDuration:
        data.count > 0 ? Math.round((data.totalDuration / data.count) * 100) / 100 : 0,
    }));

    const hourlyStats = Array.from(hourlyMap.entries()).map(([hour, count]) => ({
      hour,
      avgInstances: count,
    }));

    // Daily trend
    const trendLine = this.calculateTrendLine(instances);

    return {
      dayOfWeekStats,
      hourlyStats,
      trendLine,
    };
  }

  /**
   * Get workspace-wide process mining statistics
   */
  async getWorkspaceStats(
    workspaceId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalDefinitions: number;
    totalInstances: number;
    avgCompletionRate: number;
    avgDurationMinutes: number;
    topProcessesByVolume: { name: string; count: number }[];
    topProcessesByDuration: { name: string; avgMinutes: number }[];
    statusDistribution: { status: string; count: number }[];
  }> {
    const definitions = await this.definitionRepository.find({
      where: { workspaceId },
    });

    if (definitions.length === 0) {
      return {
        totalDefinitions: 0,
        totalInstances: 0,
        avgCompletionRate: 0,
        avgDurationMinutes: 0,
        topProcessesByVolume: [],
        topProcessesByDuration: [],
        statusDistribution: [],
      };
    }

    const definitionIds = definitions.map((d) => d.id);

    const qb = this.instanceRepository
      .createQueryBuilder('instance')
      .where('instance.processDefinitionId IN (:...ids)', { ids: definitionIds })
      .leftJoinAndSelect('instance.processDefinition', 'definition');

    if (startDate && endDate) {
      qb.andWhere('instance.startedAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    const instances = await qb.getMany();

    // Calculate stats
    const totalInstances = instances.length;
    const completedInstances = instances.filter(
      (i) => i.status === ProcessInstanceStatus.COMPLETED,
    );
    const avgCompletionRate =
      totalInstances > 0 ? (completedInstances.length / totalInstances) * 100 : 0;

    // Calculate average duration
    const durations = completedInstances
      .filter((i) => i.completedAt)
      .map((i) => (i.completedAt!.getTime() - i.startedAt.getTime()) / 60000);
    const avgDurationMinutes =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    // Group by definition
    const byDefinition = new Map<
      string,
      { name: string; count: number; totalDuration: number; completedCount: number }
    >();

    for (const instance of instances) {
      const defId = instance.processDefinitionId;
      const existing = byDefinition.get(defId);
      if (existing) {
        existing.count++;
        if (instance.status === ProcessInstanceStatus.COMPLETED && instance.completedAt) {
          existing.totalDuration +=
            (instance.completedAt.getTime() - instance.startedAt.getTime()) / 60000;
          existing.completedCount++;
        }
      } else {
        const def = instance.processDefinition;
        byDefinition.set(defId, {
          name: def?.name || 'Unknown',
          count: 1,
          totalDuration:
            instance.status === ProcessInstanceStatus.COMPLETED && instance.completedAt
              ? (instance.completedAt.getTime() - instance.startedAt.getTime()) / 60000
              : 0,
          completedCount:
            instance.status === ProcessInstanceStatus.COMPLETED && instance.completedAt
              ? 1
              : 0,
        });
      }
    }

    const topProcessesByVolume = Array.from(byDefinition.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((d) => ({ name: d.name, count: d.count }));

    const topProcessesByDuration = Array.from(byDefinition.values())
      .filter((d) => d.completedCount > 0)
      .map((d) => ({
        name: d.name,
        avgMinutes: Math.round((d.totalDuration / d.completedCount) * 100) / 100,
      }))
      .sort((a, b) => b.avgMinutes - a.avgMinutes)
      .slice(0, 5);

    // Status distribution
    const statusCounts = new Map<string, number>();
    for (const instance of instances) {
      const count = statusCounts.get(instance.status) || 0;
      statusCounts.set(instance.status, count + 1);
    }
    const statusDistribution = Array.from(statusCounts.entries()).map(
      ([status, count]) => ({ status, count }),
    );

    return {
      totalDefinitions: definitions.length,
      totalInstances,
      avgCompletionRate: Math.round(avgCompletionRate * 100) / 100,
      avgDurationMinutes: Math.round(avgDurationMinutes * 100) / 100,
      topProcessesByVolume,
      topProcessesByDuration,
      statusDistribution,
    };
  }

  /**
   * Group instances by day for trend analysis
   */
  private groupByDay(
    instances: ProcessInstance[],
  ): { date: string; count: number }[] {
    const byDay = new Map<string, number>();

    for (const instance of instances) {
      const dateStr = instance.startedAt.toISOString().split('T')[0];
      const count = byDay.get(dateStr) || 0;
      byDay.set(dateStr, count + 1);
    }

    return Array.from(byDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Create duration distribution buckets
   */
  private createDurationDistribution(
    durations: number[],
  ): { bucket: string; count: number }[] {
    if (durations.length === 0) {
      return [];
    }

    // Define buckets: <5min, 5-15min, 15-30min, 30-60min, 1-2h, 2-4h, 4-8h, >8h
    const buckets = [
      { label: '< 5 мин', min: 0, max: 5 },
      { label: '5-15 мин', min: 5, max: 15 },
      { label: '15-30 мин', min: 15, max: 30 },
      { label: '30-60 мин', min: 30, max: 60 },
      { label: '1-2 ч', min: 60, max: 120 },
      { label: '2-4 ч', min: 120, max: 240 },
      { label: '4-8 ч', min: 240, max: 480 },
      { label: '> 8 ч', min: 480, max: Infinity },
    ];

    const counts = buckets.map((b) => ({
      bucket: b.label,
      count: durations.filter((d) => d >= b.min && d < b.max).length,
    }));

    return counts.filter((c) => c.count > 0);
  }

  /**
   * Calculate trend line data
   */
  private calculateTrendLine(
    instances: ProcessInstance[],
  ): { date: string; instances: number; avgDuration: number }[] {
    const byDay = new Map<
      string,
      { count: number; totalDuration: number; completedCount: number }
    >();

    for (const instance of instances) {
      const dateStr = instance.startedAt.toISOString().split('T')[0];
      const existing = byDay.get(dateStr) || {
        count: 0,
        totalDuration: 0,
        completedCount: 0,
      };
      existing.count++;
      if (instance.completedAt) {
        existing.totalDuration +=
          (instance.completedAt.getTime() - instance.startedAt.getTime()) / 60000;
        existing.completedCount++;
      }
      byDay.set(dateStr, existing);
    }

    return Array.from(byDay.entries())
      .map(([date, data]) => ({
        date,
        instances: data.count,
        avgDuration:
          data.completedCount > 0
            ? Math.round((data.totalDuration / data.completedCount) * 100) / 100
            : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get per-element execution statistics for heat map visualization.
   * Combines data from process_activity_logs (service tasks) and user_tasks.
   */
  async getElementStats(
    definitionId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ElementStats> {
    // 1. Get service task stats from activity logs
    const activityQb = this.activityLogRepository
      .createQueryBuilder('log')
      .select('log.elementId', 'elementId')
      .addSelect('log.elementType', 'elementType')
      .addSelect('COUNT(*)::int', 'executionCount')
      .addSelect('COUNT(*) FILTER (WHERE log.status = \'success\')::int', 'successCount')
      .addSelect('COUNT(*) FILTER (WHERE log.status = \'failed\')::int', 'failedCount')
      .addSelect('AVG(log.durationMs)::int', 'avgDurationMs')
      .addSelect('MIN(log.durationMs)::int', 'minDurationMs')
      .addSelect('MAX(log.durationMs)::int', 'maxDurationMs')
      .where('log.processDefinitionId = :definitionId', { definitionId })
      .groupBy('log.elementId')
      .addGroupBy('log.elementType');

    if (startDate) {
      activityQb.andWhere('log.startedAt >= :startDate', { startDate });
    }
    if (endDate) {
      activityQb.andWhere('log.startedAt <= :endDate', { endDate });
    }

    const activityStats: ElementStatItem[] = await activityQb.getRawMany();

    // 2. Get user task stats
    // Find processInstanceIds for this definition
    const instanceQb = this.instanceRepository
      .createQueryBuilder('pi')
      .select('pi.id')
      .where('pi.processDefinitionId = :definitionId', { definitionId });

    if (startDate) {
      instanceQb.andWhere('pi.startedAt >= :startDate', { startDate });
    }
    if (endDate) {
      instanceQb.andWhere('pi.startedAt <= :endDate', { endDate });
    }

    const userTaskQb = this.userTaskRepository
      .createQueryBuilder('ut')
      .select('ut.elementId', 'elementId')
      .addSelect('\'userTask\'', 'elementType')
      .addSelect('COUNT(*)::int', 'executionCount')
      .addSelect('COUNT(*) FILTER (WHERE ut.status = \'completed\')::int', 'successCount')
      .addSelect('COUNT(*) FILTER (WHERE ut.status IN (\'cancelled\', \'expired\'))::int', 'failedCount')
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (COALESCE(ut.completedAt, ut.updatedAt) - ut.createdAt)) * 1000)::int',
        'avgDurationMs',
      )
      .addSelect(
        'MIN(EXTRACT(EPOCH FROM (COALESCE(ut.completedAt, ut.updatedAt) - ut.createdAt)) * 1000)::int',
        'minDurationMs',
      )
      .addSelect(
        'MAX(EXTRACT(EPOCH FROM (COALESCE(ut.completedAt, ut.updatedAt) - ut.createdAt)) * 1000)::int',
        'maxDurationMs',
      )
      .where(`ut.processInstanceId IN (${instanceQb.getQuery()})`)
      .setParameters(instanceQb.getParameters())
      .groupBy('ut.elementId');

    const userTaskStats: ElementStatItem[] = await userTaskQb.getRawMany();

    // 3. Merge results (activity logs + user tasks)
    const elementMap = new Map<string, ElementStatItem>();

    for (const stat of activityStats) {
      elementMap.set(stat.elementId, {
        elementId: stat.elementId,
        elementType: stat.elementType,
        executionCount: Number(stat.executionCount),
        successCount: Number(stat.successCount),
        failedCount: Number(stat.failedCount),
        avgDurationMs: stat.avgDurationMs ? Number(stat.avgDurationMs) : null,
        minDurationMs: stat.minDurationMs ? Number(stat.minDurationMs) : null,
        maxDurationMs: stat.maxDurationMs ? Number(stat.maxDurationMs) : null,
      });
    }

    for (const stat of userTaskStats) {
      const existing = elementMap.get(stat.elementId);
      if (existing) {
        // Merge: add counts, recalculate averages
        const totalCount = existing.executionCount + Number(stat.executionCount);
        existing.avgDurationMs =
          existing.avgDurationMs !== null && stat.avgDurationMs !== null
            ? Math.round(
                (existing.avgDurationMs * existing.executionCount +
                  Number(stat.avgDurationMs) * Number(stat.executionCount)) /
                  totalCount,
              )
            : existing.avgDurationMs ?? (stat.avgDurationMs ? Number(stat.avgDurationMs) : null);
        existing.executionCount = totalCount;
        existing.successCount += Number(stat.successCount);
        existing.failedCount += Number(stat.failedCount);
      } else {
        elementMap.set(stat.elementId, {
          elementId: stat.elementId,
          elementType: 'userTask',
          executionCount: Number(stat.executionCount),
          successCount: Number(stat.successCount),
          failedCount: Number(stat.failedCount),
          avgDurationMs: stat.avgDurationMs ? Number(stat.avgDurationMs) : null,
          minDurationMs: stat.minDurationMs ? Number(stat.minDurationMs) : null,
          maxDurationMs: stat.maxDurationMs ? Number(stat.maxDurationMs) : null,
        });
      }
    }

    return {
      elements: Array.from(elementMap.values()).sort(
        (a, b) => b.executionCount - a.executionCount,
      ),
    };
  }
}
