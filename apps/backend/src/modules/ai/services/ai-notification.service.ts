import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { AiNotification, AiNotificationType } from '../entities/ai-notification.entity';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';

interface ClusterInfo {
  keyword: string;
  entityIds: string[];
  workspaceId: string;
  count: number;
}

@Injectable()
export class AiNotificationService {
  private readonly logger = new Logger(AiNotificationService.name);
  private enabled = false;
  private analyzing = false;

  // Track already notified entities to avoid duplicates
  private readonly notifiedEntities = new Set<string>();
  private readonly NOTIFIED_MAX_SIZE = 5000;

  constructor(
    @InjectRepository(AiNotification)
    private readonly notificationRepository: Repository<AiNotification>,
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepository: Repository<WorkspaceEntity>,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Enable/disable proactive notifications cron
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.log(`AI Proactive Notifications ${enabled ? 'enabled' : 'disabled'}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cron: analyze new entities every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async analyzeNewEntities(): Promise<void> {
    if (!this.enabled || this.analyzing) return;
    if (!this.providerRegistry.isCompletionAvailable()) return;

    this.analyzing = true;
    try {
      const since = new Date(Date.now() - 10 * 60 * 1000); // last 10 min
      await this.detectClusters(since);
      await this.detectCriticalEntities(since);
    } catch (error) {
      this.logger.error(`Error analyzing entities: ${error.message}`);
    } finally {
      this.analyzing = false;
    }
  }

  /**
   * Detect clusters of similar entities (same workspace, similar titles)
   */
  private async detectClusters(since: Date): Promise<void> {
    const recentEntities = await this.entityRepository.find({
      where: { createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    if (recentEntities.length < 3) return;

    // Group by workspace + normalize titles
    const workspaceGroups = new Map<string, WorkspaceEntity[]>();
    for (const entity of recentEntities) {
      if (!entity.workspaceId) continue;
      const group = workspaceGroups.get(entity.workspaceId) || [];
      group.push(entity);
      workspaceGroups.set(entity.workspaceId, group);
    }

    for (const [workspaceId, entities] of workspaceGroups) {
      if (entities.length < 3) continue;

      // Simple keyword clustering: extract first 3 significant words from title
      const clusters = this.clusterByKeywords(entities, workspaceId);
      for (const cluster of clusters) {
        if (cluster.count >= 3) {
          await this.createClusterNotification(cluster);
        }
      }
    }
  }

  private clusterByKeywords(entities: WorkspaceEntity[], workspaceId: string): ClusterInfo[] {
    const keywordMap = new Map<string, { ids: string[]; workspaceId: string }>();

    for (const entity of entities) {
      if (!entity.title) continue;
      // Extract significant words (skip short words)
      const words = entity.title
        .toLowerCase()
        .replace(/[^а-яёa-z0-9\s]/gi, '')
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 3);

      if (words.length === 0) continue;
      const key = words.sort().join(' ');

      const existing = keywordMap.get(key) || { ids: [], workspaceId };
      existing.ids.push(entity.id);
      keywordMap.set(key, existing);
    }

    return Array.from(keywordMap.entries())
      .map(([keyword, data]) => ({
        keyword,
        entityIds: data.ids,
        workspaceId: data.workspaceId,
        count: data.ids.length,
      }))
      .filter((c) => c.count >= 3);
  }

  private async createClusterNotification(cluster: ClusterInfo): Promise<void> {
    // Check if already notified about this cluster
    const cacheKey = `cluster:${cluster.workspaceId}:${cluster.keyword}`;
    if (this.notifiedEntities.has(cacheKey)) return;

    const notification = this.notificationRepository.create({
      type: 'cluster_detected' as AiNotificationType,
      title: `${cluster.count} похожих заявок за последние 10 минут`,
      message: `Обнаружен кластер заявок по теме «${cluster.keyword}». Возможно, это системная проблема, требующая внимания.`,
      workspaceId: cluster.workspaceId,
      entityId: cluster.entityIds[0],
      metadata: {
        keyword: cluster.keyword,
        entityIds: cluster.entityIds,
        count: cluster.count,
      },
      confidence: Math.min(0.99, 0.6 + cluster.count * 0.1),
    });

    await this.notificationRepository.save(notification);
    this.trackNotified(cacheKey);

    this.emitNotification(notification);
  }

  /**
   * Detect critical entities (high priority keywords in title/description)
   */
  private async detectCriticalEntities(since: Date): Promise<void> {
    const criticalKeywords = [
      'авария', 'срочно', 'не работает', 'остановка', 'простой',
      'критично', 'emergency', 'сломал', 'пожар', 'утечка',
    ];

    const recentEntities = await this.entityRepository.find({
      where: { createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    for (const entity of recentEntities) {
      if (this.notifiedEntities.has(`critical:${entity.id}`)) continue;

      const titleLower = (entity.title || '').toLowerCase();
      const data = entity.data as Record<string, unknown> | undefined;
      const descLower = (typeof data?.description === 'string' ? data.description : '').toLowerCase();
      const text = `${titleLower} ${descLower}`;

      const matchedKeywords = criticalKeywords.filter((kw) => text.includes(kw));
      if (matchedKeywords.length === 0) continue;

      const notification = this.notificationRepository.create({
        type: 'critical_entity' as AiNotificationType,
        title: `Возможно критическая заявка`,
        message: `Заявка «${entity.title}» содержит признаки критической проблемы: ${matchedKeywords.join(', ')}.`,
        workspaceId: entity.workspaceId,
        entityId: entity.id,
        metadata: {
          matchedKeywords,
          entityTitle: entity.title,
        },
        confidence: Math.min(0.99, 0.5 + matchedKeywords.length * 0.15),
      });

      await this.notificationRepository.save(notification);
      this.trackNotified(`critical:${entity.id}`);

      this.emitNotification(notification);
    }
  }

  private trackNotified(key: string): void {
    this.notifiedEntities.add(key);
    if (this.notifiedEntities.size > this.NOTIFIED_MAX_SIZE) {
      // Remove oldest half
      const entries = Array.from(this.notifiedEntities);
      entries.slice(0, entries.length / 2).forEach((k) => this.notifiedEntities.delete(k));
    }
  }

  private emitNotification(notification: AiNotification): void {
    try {
      // Lazy-load EventsGateway to avoid circular dependency
      const { EventsGateway } = require('../../websocket/events.gateway');
      const gateway = this.moduleRef.get(EventsGateway, { strict: false });
      if (gateway) {
        gateway.emitAiNotification({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          workspaceId: notification.workspaceId,
          entityId: notification.entityId,
          confidence: Number(notification.confidence),
          createdAt: notification.createdAt.toISOString(),
        });
      }
    } catch {
      // Gateway not available, skip WebSocket emission
    }
  }

  // ==================== CRUD ====================

  /**
   * Get notifications for the current user or workspace
   */
  async getNotifications(options: {
    workspaceId?: string;
    userId?: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: AiNotification[]; total: number }> {
    const qb = this.notificationRepository.createQueryBuilder('n');

    qb.where('n.dismissed = :dismissed', { dismissed: false });

    if (options.workspaceId) {
      qb.andWhere('n.workspace_id = :workspaceId', { workspaceId: options.workspaceId });
    }

    if (options.userId) {
      qb.andWhere('(n.target_user_id = :userId OR n.target_user_id IS NULL)', {
        userId: options.userId,
      });
    }

    if (options.unreadOnly) {
      qb.andWhere('n.read = :read', { read: false });
    }

    qb.orderBy('n.created_at', 'DESC');
    qb.take(options.limit || 20);
    qb.skip(options.offset || 0);

    const [notifications, total] = await qb.getManyAndCount();
    return { notifications, total };
  }

  /**
   * Mark notification as read
   */
  async markRead(id: string): Promise<void> {
    await this.notificationRepository.update(id, { read: true });
  }

  /**
   * Mark all notifications as read (workspace-scoped)
   */
  async markAllRead(workspaceId?: string, userId?: string): Promise<void> {
    const qb = this.notificationRepository.createQueryBuilder()
      .update(AiNotification)
      .set({ read: true })
      .where('read = :read', { read: false });

    if (workspaceId) {
      qb.andWhere('workspace_id = :workspaceId', { workspaceId });
    }
    if (userId) {
      qb.andWhere('(target_user_id = :userId OR target_user_id IS NULL)', { userId });
    }

    await qb.execute();
  }

  /**
   * Dismiss notification
   */
  async dismiss(id: string): Promise<void> {
    await this.notificationRepository.update(id, { dismissed: true });
  }

  /**
   * Get unread count
   */
  async getUnreadCount(workspaceId?: string, userId?: string): Promise<number> {
    const qb = this.notificationRepository.createQueryBuilder('n')
      .where('n.dismissed = :dismissed', { dismissed: false })
      .andWhere('n.read = :read', { read: false });

    if (workspaceId) {
      qb.andWhere('n.workspace_id = :workspaceId', { workspaceId });
    }
    if (userId) {
      qb.andWhere('(n.target_user_id = :userId OR n.target_user_id IS NULL)', { userId });
    }

    return qb.getCount();
  }
}
