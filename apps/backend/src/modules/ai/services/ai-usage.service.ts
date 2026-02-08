import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { AiUsageLog, AiProvider, AiOperation } from '../entities/ai-usage-log.entity';

export interface UsageStatsDto {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  successRate: number;
  byProvider: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    avgLatency: number;
  }>;
  byOperation: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

export interface UsageFilters {
  startDate?: Date;
  endDate?: Date;
  provider?: AiProvider;
  operation?: AiOperation;
  userId?: string;
  workspaceId?: string;
}

/**
 * Сервис статистики использования AI
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectRepository(AiUsageLog)
    private readonly usageLogRepo: Repository<AiUsageLog>,
  ) {}

  /**
   * Получить статистику использования AI
   */
  async getUsageStats(filters: UsageFilters = {}): Promise<UsageStatsDto> {
    const queryBuilder = this.usageLogRepo.createQueryBuilder('log');

    // Применяем фильтры
    if (filters.startDate) {
      queryBuilder.andWhere('log.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      queryBuilder.andWhere('log.created_at <= :endDate', { endDate: filters.endDate });
    }
    if (filters.provider) {
      queryBuilder.andWhere('log.provider = :provider', { provider: filters.provider });
    }
    if (filters.operation) {
      queryBuilder.andWhere('log.operation = :operation', { operation: filters.operation });
    }
    if (filters.userId) {
      queryBuilder.andWhere('log.user_id = :userId', { userId: filters.userId });
    }
    if (filters.workspaceId) {
      queryBuilder.andWhere('log.workspace_id = :workspaceId', { workspaceId: filters.workspaceId });
    }

    // Получаем сырые данные
    const logs = await queryBuilder.getMany();

    if (logs.length === 0) {
      return {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        avgLatencyMs: 0,
        successRate: 100,
        byProvider: {},
        byOperation: {},
        byDay: [],
      };
    }

    // Агрегируем статистику
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatency = 0;
    let successCount = 0;

    const byProvider: Record<string, { requests: number; inputTokens: number; outputTokens: number; totalLatency: number }> = {};
    const byOperation: Record<string, { requests: number; inputTokens: number; outputTokens: number }> = {};
    const byDayMap: Record<string, { requests: number; inputTokens: number; outputTokens: number }> = {};

    for (const log of logs) {
      totalInputTokens += log.inputTokens;
      totalOutputTokens += log.outputTokens;
      totalLatency += log.latencyMs;
      if (log.success) successCount++;

      // По провайдеру
      if (!byProvider[log.provider]) {
        byProvider[log.provider] = { requests: 0, inputTokens: 0, outputTokens: 0, totalLatency: 0 };
      }
      byProvider[log.provider].requests++;
      byProvider[log.provider].inputTokens += log.inputTokens;
      byProvider[log.provider].outputTokens += log.outputTokens;
      byProvider[log.provider].totalLatency += log.latencyMs;

      // По операции
      if (!byOperation[log.operation]) {
        byOperation[log.operation] = { requests: 0, inputTokens: 0, outputTokens: 0 };
      }
      byOperation[log.operation].requests++;
      byOperation[log.operation].inputTokens += log.inputTokens;
      byOperation[log.operation].outputTokens += log.outputTokens;

      // По дням
      const dateKey = log.createdAt.toISOString().split('T')[0];
      if (!byDayMap[dateKey]) {
        byDayMap[dateKey] = { requests: 0, inputTokens: 0, outputTokens: 0 };
      }
      byDayMap[dateKey].requests++;
      byDayMap[dateKey].inputTokens += log.inputTokens;
      byDayMap[dateKey].outputTokens += log.outputTokens;
    }

    // Формируем результат по провайдерам с avg latency
    const byProviderResult: UsageStatsDto['byProvider'] = {};
    for (const [provider, stats] of Object.entries(byProvider)) {
      byProviderResult[provider] = {
        requests: stats.requests,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        avgLatency: Math.round(stats.totalLatency / stats.requests),
      };
    }

    // Сортируем дни и формируем массив
    const byDay: UsageStatsDto['byDay'] = Object.entries(byDayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        requests: stats.requests,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        totalTokens: stats.inputTokens + stats.outputTokens,
      }));

    return {
      totalRequests: logs.length,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      avgLatencyMs: Math.round(totalLatency / logs.length),
      successRate: Math.round((successCount / logs.length) * 100),
      byProvider: byProviderResult,
      byOperation,
      byDay,
    };
  }

  /**
   * Получить последние логи использования
   */
  async getRecentLogs(limit = 50, filters: UsageFilters = {}): Promise<AiUsageLog[]> {
    const queryBuilder = this.usageLogRepo.createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.created_at', 'DESC')
      .take(limit);

    if (filters.provider) {
      queryBuilder.andWhere('log.provider = :provider', { provider: filters.provider });
    }
    if (filters.operation) {
      queryBuilder.andWhere('log.operation = :operation', { operation: filters.operation });
    }
    if (filters.userId) {
      queryBuilder.andWhere('log.user_id = :userId', { userId: filters.userId });
    }

    return queryBuilder.getMany();
  }

  /**
   * Получить статистику за последние N дней
   */
  async getStatsForLastDays(days = 30): Promise<UsageStatsDto> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return this.getUsageStats({ startDate });
  }
}
