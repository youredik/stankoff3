import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AuditLog, AuditActionType, AuditLogDetails } from './audit-log.entity';

export interface AuditLogFilters {
  action?: AuditActionType;
  entityId?: string;
  actorId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sort?: 'newest' | 'oldest';
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    action: AuditActionType,
    workspaceId: string,
    actorId: string | null,
    details: AuditLogDetails,
    entityId?: string | null,
  ): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      action,
      workspaceId,
      actorId,
      entityId: entityId || null,
      details,
    });

    return this.auditLogRepository.save(auditLog);
  }

  async getEntityHistory(
    entityId: string,
    options: PaginationOptions = {},
  ): Promise<{ logs: AuditLog[]; total: number; hasMore: boolean }> {
    const { limit = 50, offset = 0, sort = 'newest' } = options;

    const [logs, total] = await this.auditLogRepository.findAndCount({
      where: { entityId },
      relations: ['actor'],
      order: { createdAt: sort === 'newest' ? 'DESC' : 'ASC' },
      take: limit,
      skip: offset,
    });

    return {
      logs,
      total,
      hasMore: offset + logs.length < total,
    };
  }

  async getWorkspaceHistory(
    workspaceId: string,
    filters: AuditLogFilters = {},
    options: PaginationOptions = {},
  ): Promise<{ logs: AuditLog[]; total: number; hasMore: boolean }> {
    const { limit = 100, offset = 0, sort = 'newest' } = options;

    const where: any = { workspaceId };

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.entityId) {
      where.entityId = filters.entityId;
    }

    if (filters.actorId) {
      where.actorId = filters.actorId;
    }

    if (filters.fromDate && filters.toDate) {
      where.createdAt = Between(filters.fromDate, filters.toDate);
    } else if (filters.fromDate) {
      where.createdAt = MoreThanOrEqual(filters.fromDate);
    } else if (filters.toDate) {
      where.createdAt = LessThanOrEqual(filters.toDate);
    }

    const [logs, total] = await this.auditLogRepository.findAndCount({
      where,
      relations: ['actor', 'entity'],
      order: { createdAt: sort === 'newest' ? 'DESC' : 'ASC' },
      take: limit,
      skip: offset,
    });

    return {
      logs,
      total,
      hasMore: offset + logs.length < total,
    };
  }

  // Генераторы описаний на русском
  static generateDescription(
    action: AuditActionType,
    actorName: string,
    details?: Partial<AuditLogDetails>,
  ): string {
    switch (action) {
      case AuditActionType.ENTITY_CREATED:
        return `${actorName} создал(а) заявку`;
      case AuditActionType.ENTITY_UPDATED:
        return `${actorName} обновил(а) заявку`;
      case AuditActionType.ENTITY_DELETED:
        return `${actorName} удалил(а) заявку`;
      case AuditActionType.ENTITY_STATUS_CHANGED:
        return `${actorName} изменил(а) статус`;
      case AuditActionType.ENTITY_ASSIGNEE_CHANGED:
        return `${actorName} изменил(а) исполнителя`;
      case AuditActionType.COMMENT_CREATED:
        return `${actorName} добавил(а) комментарий`;
      case AuditActionType.COMMENT_UPDATED:
        return `${actorName} отредактировал(а) комментарий`;
      case AuditActionType.COMMENT_DELETED:
        return `${actorName} удалил(а) комментарий`;
      case AuditActionType.FILE_UPLOADED:
        return `${actorName} загрузил(а) файл ${details?.fileName || ''}`;
      case AuditActionType.FILE_DELETED:
        return `${actorName} удалил(а) файл ${details?.fileName || ''}`;
      default:
        return `${actorName} выполнил(а) действие`;
    }
  }
}
