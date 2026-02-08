import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { LegacyService } from './legacy.service';
import { LegacyMigrationService } from './legacy-migration.service';
import { LegacyMigrationLog } from '../entities/legacy-migration-log.entity';
import { LegacyRequest } from '../entities/legacy-request.entity';
import { Workspace } from '../../workspace/workspace.entity';

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: Date | null;
  lastSyncResult: SyncResult | null;
  totalSynced: number;
}

export interface SyncResult {
  newRequests: number;
  updatedRequests: number;
  newComments: number;
  errors: number;
  syncedAt: Date;
}

const LEGACY_WORKSPACE_PREFIX = 'LEG';

@Injectable()
export class LegacySyncService {
  private readonly logger = new Logger(LegacySyncService.name);

  private enabled = false;
  private lastSyncAt: Date | null = null;
  private lastSyncResult: SyncResult | null = null;
  private totalSynced = 0;
  private isSyncing = false;

  constructor(
    private readonly legacyService: LegacyService,
    private readonly migrationService: LegacyMigrationService,
    @InjectRepository(LegacyMigrationLog)
    private readonly migrationLogRepository: Repository<LegacyMigrationLog>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly dataSource: DataSource,
  ) {}

  getStatus(): SyncStatus {
    return {
      enabled: this.enabled,
      lastSyncAt: this.lastSyncAt,
      lastSyncResult: this.lastSyncResult,
      totalSynced: this.totalSynced,
    };
  }

  enable(): { message: string } {
    this.enabled = true;
    this.logger.log('Legacy sync включён');
    return { message: 'Legacy sync включён' };
  }

  disable(): { message: string } {
    this.enabled = false;
    this.logger.log('Legacy sync выключен');
    return { message: 'Legacy sync выключен' };
  }

  @Cron('*/5 * * * *')
  async scheduledSync(): Promise<void> {
    if (!this.enabled) return;
    await this.runSync();
  }

  async runSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return this.lastSyncResult || {
        newRequests: 0,
        updatedRequests: 0,
        newComments: 0,
        errors: 0,
        syncedAt: new Date(),
      };
    }

    if (!this.legacyService.isAvailable()) {
      this.logger.warn('Legacy БД недоступна, пропуск синхронизации');
      return {
        newRequests: 0,
        updatedRequests: 0,
        newComments: 0,
        errors: 0,
        syncedAt: new Date(),
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      newRequests: 0,
      updatedRequests: 0,
      newComments: 0,
      errors: 0,
      syncedAt: new Date(),
    };

    try {
      // Время последней синхронизации (по умолчанию — 5 минут назад)
      const since = this.lastSyncAt || new Date(Date.now() - 5 * 60 * 1000);

      // 1. Получаем новые/обновлённые заявки из legacy
      const requests = await this.legacyService.getNewRequestsSince(since);

      if (requests.length === 0) {
        this.lastSyncAt = new Date();
        this.lastSyncResult = result;
        return result;
      }

      // 2. Проверяем workspace
      const workspace = await this.workspaceRepository.findOne({
        where: { prefix: LEGACY_WORKSPACE_PREFIX },
      });
      if (!workspace) {
        this.logger.warn('Workspace LEG не найден, пропуск синхронизации');
        return result;
      }

      // 3. Разделяем на новые и существующие
      const requestIds = requests.map((r) => r.id);
      const existingLogs = await this.migrationLogRepository
        .createQueryBuilder('log')
        .where('log.legacyRequestId IN (:...ids)', { ids: requestIds })
        .getMany();
      const existingSet = new Map(
        existingLogs.map((l) => [l.legacyRequestId, l]),
      );

      const newRequests = requests.filter((r) => !existingSet.has(r.id));
      const updatedRequests = requests.filter((r) => existingSet.has(r.id));

      // 4. Новые заявки — мигрируем через migrationService
      if (newRequests.length > 0) {
        try {
          const batchResult =
            await this.migrationService.migrateBatchRequests(newRequests);
          result.newRequests = batchResult.processed;
          result.newComments += batchResult.commentsCreated;
          result.errors += batchResult.failed;
        } catch (err) {
          this.logger.error(`Sync: ошибка миграции новых заявок: ${err.message}`);
          result.errors += newRequests.length;
        }
      }

      // 5. Обновлённые — синхронизируем статус и новые ответы
      for (const request of updatedRequests) {
        try {
          await this.syncExistingRequest(request, existingSet.get(request.id)!);
          result.updatedRequests++;
        } catch (err) {
          this.logger.warn(
            `Sync: ошибка обновления заявки ${request.id}: ${err.message}`,
          );
          result.errors++;
        }
      }

      this.totalSynced += result.newRequests + result.updatedRequests;
      this.lastSyncAt = new Date();
      this.lastSyncResult = result;

      if (result.newRequests > 0 || result.updatedRequests > 0) {
        this.logger.log(
          `Sync: ${result.newRequests} новых, ${result.updatedRequests} обновлённых, ` +
            `${result.newComments} комментариев, ${result.errors} ошибок`,
        );
      }
    } catch (err) {
      this.logger.error(`Sync failed: ${err.message}`, err.stack);
      result.errors++;
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  private async syncExistingRequest(
    request: LegacyRequest,
    log: LegacyMigrationLog,
  ): Promise<void> {
    // 1. Обновляем статус entity
    const newStatus = this.migrationService.mapStatus(request);

    await this.dataSource.query(
      `UPDATE "entities" SET
        "status" = $1,
        "resolvedAt" = $2,
        "updatedAt" = NOW()
      WHERE "id" = $3`,
      [newStatus, request.closed === 1 ? (request.updatedAt || request.createdAt) : null, log.entityId],
    );

    // 2. Проверяем новые ответы (ответы позже последней синхронизации)
    if (this.lastSyncAt) {
      const newAnswers = await this.legacyService.getNewAnswersSince(
        this.lastSyncAt,
        [request.id],
      );

      for (const answer of newAnswers) {
        if (!answer.text || answer.text.trim().length === 0) continue;

        // Проверяем, не был ли уже добавлен этот комментарий (по времени)
        const existing = await this.dataSource.query(
          `SELECT "id" FROM "comments"
           WHERE "entityId" = $1 AND "createdAt" = $2
           LIMIT 1`,
          [log.entityId, answer.createdAt],
        );

        if (existing.length > 0) continue;

        // Используем buildUserMapping из migrationService
        const userMapping = await this.migrationService.buildUserMapping();
        const authorId =
          userMapping.employeeMap.get(answer.customerId) ||
          userMapping.systemUserId;

        await this.dataSource.query(
          `INSERT INTO "comments" (
            "id", "entityId", "authorId", "content",
            "mentionedUserIds", "attachments", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uuidv4(),
            log.entityId,
            authorId,
            this.migrationService.cleanHtml(answer.text),
            JSON.stringify([]),
            JSON.stringify([]),
            answer.createdAt,
            answer.createdAt,
          ],
        );
      }

      // Обновляем commentCount
      const countResult = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "comments" WHERE "entityId" = $1`,
        [log.entityId],
      );
      const commentCount = parseInt(countResult[0]?.count || '0', 10);

      await this.dataSource.query(
        `UPDATE "entities" SET "commentCount" = $1 WHERE "id" = $2`,
        [commentCount, log.entityId],
      );
    }
  }
}
