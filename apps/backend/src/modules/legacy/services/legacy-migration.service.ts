import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LegacyService } from './legacy.service';
import { LegacyMigrationLog } from '../entities/legacy-migration-log.entity';
import { LegacyRequest } from '../entities/legacy-request.entity';
import { LegacyAnswer } from '../entities/legacy-answer.entity';
import { LegacyCustomer } from '../entities/legacy-customer.entity';
import { User, UserRole } from '../../user/user.entity';
import { Workspace } from '../../workspace/workspace.entity';

export interface MigrationProgress {
  totalRequests: number;
  processedRequests: number;
  totalComments: number;
  skippedRequests: number;
  failedRequests: number;
  startedAt: Date | null;
  completedAt: Date | null;
  isRunning: boolean;
  currentBatch: number;
  totalBatches: number;
  error: string | null;
}

export interface MigrationPreview {
  legacyRequestsCount: number;
  legacyAnswersCount: number;
  alreadyMigratedCount: number;
  remainingCount: number;
  employeeMappingCount: number;
  unmappedEmployeeCount: number;
  workspaceExists: boolean;
  workspaceId: string | null;
}

export interface ValidationResult {
  entitiesCreated: number;
  legacyTotal: number;
  migrationLogCompleted: number;
  migrationLogFailed: number;
  coveragePercent: number;
  sampleSize: number;
  integrityErrors: number;
}

interface UserMapping {
  employeeMap: Map<number, string>; // legacyCustomerId → User.id (UUID)
  managerMap: Map<number, string>; // legacy manager.id → User.id (UUID)
  systemUserId: string;
  unmappedCount: number;
}

interface BatchResult {
  processed: number;
  skipped: number;
  failed: number;
  commentsCreated: number;
}

// Legacy таблица QD_requests не имеет status_id — только closed (0/1)

const LEGACY_WORKSPACE_PREFIX = 'LEG';
const LEGACY_SYSTEM_EMAIL = 'legacy-system@stankoff.ru';

@Injectable()
export class LegacyMigrationService {
  private readonly logger = new Logger(LegacyMigrationService.name);

  private progress: MigrationProgress = {
    totalRequests: 0,
    processedRequests: 0,
    totalComments: 0,
    skippedRequests: 0,
    failedRequests: 0,
    startedAt: null,
    completedAt: null,
    isRunning: false,
    currentBatch: 0,
    totalBatches: 0,
    error: null,
  };

  private shouldStop = false;
  private userMapping: UserMapping | null = null;
  private workspaceId: string | null = null;

  constructor(
    private readonly legacyService: LegacyService,
    @InjectRepository(LegacyMigrationLog)
    private readonly migrationLogRepository: Repository<LegacyMigrationLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== PUBLIC API ====================

  getProgress(): MigrationProgress {
    return { ...this.progress };
  }

  async getPreview(): Promise<MigrationPreview> {
    const legacyAvailable = this.legacyService.isAvailable();

    const [legacyRequestsCount, alreadyMigratedCount] = await Promise.all([
      legacyAvailable ? this.legacyService.getRequestsCount() : 0,
      this.migrationLogRepository.count({ where: { status: 'completed' } }),
    ]);

    // Подсчёт ответов из legacy stats
    const stats = legacyAvailable
      ? await this.legacyService.getIndexingStats()
      : { totalAnswers: 0 };

    // Маппинг пользователей
    const mapping = await this.buildUserMapping();

    // Проверка workspace
    const workspace = await this.workspaceRepository.findOne({
      where: { prefix: LEGACY_WORKSPACE_PREFIX },
    });

    return {
      legacyRequestsCount,
      legacyAnswersCount: stats.totalAnswers,
      alreadyMigratedCount,
      remainingCount: legacyRequestsCount - alreadyMigratedCount,
      employeeMappingCount: mapping.employeeMap.size,
      unmappedEmployeeCount: mapping.unmappedCount,
      workspaceExists: !!workspace,
      workspaceId: workspace?.id || null,
    };
  }

  async startMigration(options: {
    batchSize?: number;
    maxRequests?: number;
    dryRun?: boolean;
  } = {}): Promise<{ message: string }> {
    if (this.progress.isRunning) {
      throw new Error('Миграция уже запущена');
    }

    if (!this.legacyService.isAvailable()) {
      throw new Error('Legacy БД недоступна');
    }

    const { batchSize = 500, maxRequests, dryRun = false } = options;

    // Подготовка
    this.userMapping = await this.buildUserMapping();
    const workspace = await this.ensureLegacyWorkspace();
    this.workspaceId = workspace.id;

    const totalCount = await this.legacyService.getRequestsCount();
    const toProcess = maxRequests ? Math.min(totalCount, maxRequests) : totalCount;

    // Инициализация прогресса
    this.progress = {
      totalRequests: toProcess,
      processedRequests: 0,
      totalComments: 0,
      skippedRequests: 0,
      failedRequests: 0,
      startedAt: new Date(),
      completedAt: null,
      isRunning: true,
      currentBatch: 0,
      totalBatches: Math.ceil(toProcess / batchSize),
      error: null,
    };
    this.shouldStop = false;

    if (dryRun) {
      this.progress.isRunning = false;
      this.progress.completedAt = new Date();
      return {
        message: `Dry run: ${toProcess} заявок для миграции, ${this.userMapping.employeeMap.size} сотрудников замаплено`,
      };
    }

    // Запуск асинхронно (не блокируем HTTP ответ)
    this.runMigrationLoop(batchSize, toProcess).catch((err) => {
      this.logger.error(`Миграция упала: ${err.message}`, err.stack);
      this.progress.isRunning = false;
      this.progress.error = err.message;
    });

    return {
      message: `Миграция запущена: ${toProcess} заявок, батч ${batchSize}`,
    };
  }

  stopMigration(): { message: string } {
    if (!this.progress.isRunning) {
      return { message: 'Миграция не запущена' };
    }
    this.shouldStop = true;
    return { message: 'Остановка миграции после текущего батча...' };
  }

  async validateMigration(): Promise<ValidationResult> {
    const workspace = await this.workspaceRepository.findOne({
      where: { prefix: LEGACY_WORKSPACE_PREFIX },
    });

    if (!workspace) {
      return {
        entitiesCreated: 0,
        legacyTotal: 0,
        migrationLogCompleted: 0,
        migrationLogFailed: 0,
        coveragePercent: 0,
        sampleSize: 0,
        integrityErrors: 0,
      };
    }

    const [entitiesCreated, legacyTotal, logCompleted, logFailed] =
      await Promise.all([
        this.dataSource
          .createQueryBuilder()
          .from('entities', 'e')
          .where('"workspaceId" = :wsId', { wsId: workspace.id })
          .getCount(),
        this.legacyService.isAvailable()
          ? this.legacyService.getRequestsCount()
          : 0,
        this.migrationLogRepository.count({ where: { status: 'completed' } }),
        this.migrationLogRepository.count({ where: { status: 'failed' } }),
      ]);

    // Spot-check: случайная выборка 100 записей
    let integrityErrors = 0;
    const sampleSize = Math.min(100, logCompleted);

    if (sampleSize > 0 && this.legacyService.isAvailable()) {
      const sample = await this.migrationLogRepository
        .createQueryBuilder('log')
        .where('log.status = :status', { status: 'completed' })
        .orderBy('RANDOM()')
        .limit(sampleSize)
        .getMany();

      for (const log of sample) {
        try {
          const entity = await this.dataSource
            .createQueryBuilder()
            .select('e.title', 'title')
            .from('entities', 'e')
            .where('e.id = :id', { id: log.entityId })
            .getRawOne();

          if (!entity) {
            integrityErrors++;
          }
        } catch {
          integrityErrors++;
        }
      }
    }

    return {
      entitiesCreated,
      legacyTotal,
      migrationLogCompleted: logCompleted,
      migrationLogFailed: logFailed,
      coveragePercent: legacyTotal > 0 ? Math.round((logCompleted / legacyTotal) * 100) : 0,
      sampleSize,
      integrityErrors,
    };
  }

  async getMigrationLog(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: LegacyMigrationLog[]; total: number }> {
    const { status, limit = 50, offset = 0 } = options;

    const where = status ? { status } : {};
    const [items, total] = await this.migrationLogRepository.findAndCount({
      where,
      order: { migratedAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { items, total };
  }

  async retryFailed(): Promise<{ message: string; retried: number }> {
    if (this.progress.isRunning) {
      throw new Error('Миграция уже запущена');
    }

    if (!this.legacyService.isAvailable()) {
      throw new Error('Legacy БД недоступна');
    }

    const failedLogs = await this.migrationLogRepository.find({
      where: { status: 'failed' },
    });

    if (failedLogs.length === 0) {
      return { message: 'Нет ошибочных записей', retried: 0 };
    }

    // Подготовка
    if (!this.userMapping) {
      this.userMapping = await this.buildUserMapping();
    }
    if (!this.workspaceId) {
      const ws = await this.workspaceRepository.findOne({
        where: { prefix: LEGACY_WORKSPACE_PREFIX },
      });
      this.workspaceId = ws?.id || null;
    }
    if (!this.workspaceId) {
      throw new Error('Workspace LEG не найден');
    }

    // Удаляем ошибочные записи и ретраим
    const failedRequestIds = failedLogs.map((l) => l.legacyRequestId);
    await this.migrationLogRepository.delete(
      failedLogs.map((l) => l.id),
    );

    let retried = 0;
    // Обрабатываем батчами по 100
    for (let i = 0; i < failedRequestIds.length; i += 100) {
      const batch = failedRequestIds.slice(i, i + 100);
      const requests: LegacyRequest[] = [];
      for (const rid of batch) {
        const reqs = await this.legacyService.getAllRequestsBatch(0, 1);
        // Нужен запрос по конкретному ID — используем getRequestWithAnswers
        const data = await this.legacyService.getRequestWithAnswers(rid);
        if (data.request) {
          requests.push(data.request);
        }
      }

      if (requests.length > 0) {
        const result = await this.migrateBatchRequests(requests);
        retried += result.processed;
      }
    }

    return { message: `Ретрай завершён`, retried };
  }

  // ==================== PRIVATE METHODS ====================

  private async runMigrationLoop(
    batchSize: number,
    totalToProcess: number,
  ): Promise<void> {
    let offset = 0;

    while (offset < totalToProcess && !this.shouldStop) {
      this.progress.currentBatch++;

      try {
        const requests = await this.legacyService.getAllRequestsBatch(
          offset,
          batchSize,
        );

        if (requests.length === 0) break;

        const result = await this.migrateBatchRequests(requests);

        this.progress.processedRequests += result.processed;
        this.progress.skippedRequests += result.skipped;
        this.progress.failedRequests += result.failed;
        this.progress.totalComments += result.commentsCreated;

        this.logger.log(
          `Батч ${this.progress.currentBatch}/${this.progress.totalBatches}: ` +
            `обработано ${result.processed}, пропущено ${result.skipped}, ` +
            `ошибок ${result.failed}, комментариев ${result.commentsCreated}`,
        );

        offset += batchSize;
      } catch (err) {
        this.logger.error(`Ошибка батча ${this.progress.currentBatch}: ${err.message}`);
        this.progress.failedRequests += batchSize;
        offset += batchSize;
        // Продолжаем со следующим батчем
      }
    }

    this.progress.isRunning = false;
    this.progress.completedAt = new Date();

    if (this.shouldStop) {
      this.logger.log('Миграция остановлена пользователем');
    } else {
      this.logger.log(
        `Миграция завершена: ${this.progress.processedRequests} заявок, ` +
          `${this.progress.totalComments} комментариев, ` +
          `${this.progress.failedRequests} ошибок`,
      );
    }
  }

  async migrateBatchRequests(requests: LegacyRequest[]): Promise<BatchResult> {
    const result: BatchResult = {
      processed: 0,
      skipped: 0,
      failed: 0,
      commentsCreated: 0,
    };

    if (!this.userMapping || !this.workspaceId) {
      throw new Error('Миграция не инициализирована');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Фильтруем уже мигрированные
      const requestIds = requests.map((r) => r.id);
      const alreadyMigrated = await queryRunner.query(
        `SELECT "legacyRequestId" FROM "legacy_migration_log" WHERE "legacyRequestId" = ANY($1)`,
        [requestIds],
      );
      const migratedSet = new Set(
        alreadyMigrated.map(
          (r: { legacyRequestId: number }) => r.legacyRequestId,
        ),
      );

      const toMigrate = requests.filter((r) => !migratedSet.has(r.id));
      result.skipped = migratedSet.size;

      if (toMigrate.length === 0) {
        await queryRunner.rollbackTransaction();
        return result;
      }

      // 2. Batch-читаем ответы
      const answersByRequest =
        await this.legacyService.getRequestsWithAnswersBatch(
          toMigrate.map((r) => r.id),
        );

      // 3. Batch-читаем клиентов для enrichment
      const customerIds = [
        ...new Set(toMigrate.map((r) => r.customerId).filter(Boolean)),
      ];
      const customers = await this.legacyService.getCustomersByIds(customerIds);

      // 4. Вставляем entities и comments
      for (const request of toMigrate) {
        try {
          const entityId = uuidv4();
          const customId = `${LEGACY_WORKSPACE_PREFIX}-${request.id}`;
          const customer = customers.get(request.customerId);
          const assigneeId = this.resolveAssignee(request.managerId);

          const data = this.buildEntityData(request, customer);
          const status = this.mapStatus(request);
          const priority = 'low'; // Legacy не имеет поля priority

          // INSERT entity
          await queryRunner.query(
            `INSERT INTO "entities" (
              "id", "customId", "workspaceId", "title", "status",
              "priority", "assigneeId", "data", "linkedEntityIds",
              "commentCount", "lastActivityAt", "firstResponseAt",
              "resolvedAt", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT ("customId") DO NOTHING`,
            [
              entityId,
              customId,
              this.workspaceId,
              request.subject || 'Без темы',
              status,
              priority,
              assigneeId,
              JSON.stringify(data),
              JSON.stringify([]),
              0,
              request.updatedAt || request.createdAt,
              null,
              request.closed === 1 ? (request.updatedAt || request.createdAt) : null,
              request.createdAt,
              request.updatedAt || request.createdAt,
            ],
          );

          // INSERT comments
          const answers =
            answersByRequest.get(request.id)?.answers || [];
          let commentCount = 0;
          let firstResponseAt: Date | null = null;

          for (const answer of answers) {
            if (!answer.text || answer.text.trim().length === 0) continue;

            const authorId = this.resolveAuthor(answer.customerId);
            const isEmployee = this.userMapping!.employeeMap.has(
              answer.customerId,
            );
            if (isEmployee && !firstResponseAt) {
              firstResponseAt = answer.createdAt;
            }

            const commentId = uuidv4();
            await queryRunner.query(
              `INSERT INTO "comments" (
                "id", "entityId", "authorId", "content",
                "mentionedUserIds", "attachments", "createdAt", "updatedAt"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                commentId,
                entityId,
                authorId,
                this.cleanHtml(answer.text),
                JSON.stringify([]),
                JSON.stringify([]),
                answer.createdAt,
                answer.createdAt,
              ],
            );
            commentCount++;
          }

          // Обновляем commentCount и firstResponseAt
          if (commentCount > 0 || firstResponseAt) {
            await queryRunner.query(
              `UPDATE "entities" SET "commentCount" = $1, "firstResponseAt" = $2
               WHERE "id" = $3`,
              [commentCount, firstResponseAt, entityId],
            );
          }

          // Лог миграции
          await queryRunner.query(
            `INSERT INTO "legacy_migration_log" (
              "id", "legacyRequestId", "entityId", "commentsCount", "status"
            ) VALUES ($1, $2, $3, $4, 'completed')
            ON CONFLICT ("legacyRequestId") DO NOTHING`,
            [uuidv4(), request.id, entityId, commentCount],
          );

          result.processed++;
          result.commentsCreated += commentCount;
        } catch (err) {
          this.logger.warn(
            `Ошибка миграции заявки ${request.id}: ${err.message}`,
          );

          // Логируем ошибку
          try {
            await queryRunner.query(
              `INSERT INTO "legacy_migration_log" (
                "id", "legacyRequestId", "entityId", "status", "errorMessage"
              ) VALUES ($1, $2, $3, 'failed', $4)
              ON CONFLICT ("legacyRequestId") DO NOTHING`,
              [uuidv4(), request.id, uuidv4(), err.message],
            );
          } catch {
            // Игнорируем ошибку логирования
          }

          result.failed++;
        }
      }

      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== HELPERS ====================

  async buildUserMapping(): Promise<UserMapping> {
    // 1. Все менеджеры из legacy
    const allManagers = await this.legacyService.getAllManagers();

    // 2. Их customer-записи (для email)
    const managerUserIds = allManagers.map((m) => m.userId);
    const customers =
      managerUserIds.length > 0
        ? await this.legacyService.getCustomersByIds(managerUserIds)
        : new Map<number, LegacyCustomer>();

    // 3. Все User из PostgreSQL
    const allUsers = await this.userRepository.find();
    const userByEmail = new Map(
      allUsers.map((u) => [u.email.toLowerCase(), u.id]),
    );

    // 4. Маппинг по email
    const employeeMap = new Map<number, string>();
    let unmappedCount = 0;

    for (const manager of allManagers) {
      const customer = customers.get(manager.userId);
      if (customer?.email) {
        const userId = userByEmail.get(customer.email.toLowerCase());
        if (userId) {
          employeeMap.set(customer.id, userId);
        } else {
          unmappedCount++;
        }
      } else {
        unmappedCount++;
      }
    }

    // 5. Маппинг manager.id → User.id (для assignee)
    const managerMap = new Map<number, string>();
    for (const manager of allManagers) {
      const userId = employeeMap.get(manager.userId);
      if (userId) {
        managerMap.set(manager.id, userId);
      }
    }

    // 6. "Legacy System" пользователь
    let systemUser = await this.userRepository.findOne({
      where: { email: LEGACY_SYSTEM_EMAIL },
    });

    if (!systemUser) {
      systemUser = await this.userRepository.save(
        this.userRepository.create({
          email: LEGACY_SYSTEM_EMAIL,
          password: 'disabled-legacy-system-' + uuidv4(),
          firstName: 'Legacy',
          lastName: 'System',
          role: UserRole.EMPLOYEE,
          isActive: false,
        }),
      );
      this.logger.log(`Создан системный пользователь: ${LEGACY_SYSTEM_EMAIL}`);
    }

    return { employeeMap, managerMap, systemUserId: systemUser.id, unmappedCount };
  }

  async ensureLegacyWorkspace(): Promise<Workspace> {
    let workspace = await this.workspaceRepository.findOne({
      where: { prefix: LEGACY_WORKSPACE_PREFIX },
    });

    if (workspace) return workspace;

    workspace = this.workspaceRepository.create({
      name: 'Legacy CRM (Миграция)',
      icon: '📦',
      prefix: LEGACY_WORKSPACE_PREFIX,
      lastEntityNumber: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'legacyRequestId', name: 'Legacy RID', type: 'number' as const },
            { id: 'requestType', name: 'Тип заявки', type: 'text' as const },
            { id: 'legacyBody', name: 'Описание', type: 'textarea' as const },
          ],
        },
        {
          id: 'customer',
          name: 'Клиент',
          order: 1,
          fields: [
            { id: 'legacyCustomerId', name: 'Legacy Customer ID', type: 'number' as const },
            { id: 'customerName', name: 'Имя клиента', type: 'text' as const },
            { id: 'customerEmail', name: 'Email клиента', type: 'text' as const },
            { id: 'customerPhone', name: 'Телефон клиента', type: 'text' as const },
          ],
        },
        {
          id: 'counterparty',
          name: 'Контрагент',
          order: 2,
          fields: [
            { id: 'counterpartyId', name: 'ID контрагента', type: 'number' as const },
            { id: 'counterpartyName', name: 'Контрагент', type: 'text' as const },
          ],
        },
      ],
    });

    workspace = await this.workspaceRepository.save(workspace);
    this.logger.log(`Создан workspace: ${workspace.name} (${workspace.id})`);
    return workspace;
  }

  mapStatus(request: LegacyRequest): string {
    // Legacy таблица QD_requests имеет только поле closed (0/1)
    return request.closed === 1 ? 'closed' : 'new';
  }

  private resolveAssignee(managerId: number | null): string | null {
    if (!managerId || !this.userMapping) return null;
    return this.userMapping.managerMap.get(managerId) || null;
  }

  private resolveAuthor(legacyCustomerId: number): string {
    if (!this.userMapping) return this.userMapping!.systemUserId;
    return (
      this.userMapping.employeeMap.get(legacyCustomerId) ||
      this.userMapping.systemUserId
    );
  }

  private buildEntityData(
    request: LegacyRequest,
    customer: LegacyCustomer | undefined,
  ): Record<string, any> {
    const data: Record<string, any> = {
      legacyRequestId: request.id,
      requestType: request.type || null,
      legacyUrl: `https://www.stankoff.ru/crm/request/${request.id}`,
    };

    if (customer) {
      data.legacyCustomerId = customer.id;
      const firstName = customer.firstName || '';
      const lastName = customer.lastName || '';
      data.customerName =
        [firstName, lastName].filter(Boolean).join(' ') || null;
      data.customerEmail = customer.email || null;
      data.customerPhone = customer.phone || null;
      if (customer.defaultCounterpartyId) {
        data.counterpartyId = customer.defaultCounterpartyId;
      }
    }

    return data;
  }

  async updateAssignees(): Promise<{ updated: number; total: number }> {
    const mapping = await this.buildUserMapping();

    if (mapping.managerMap.size === 0) {
      return { updated: 0, total: 0 };
    }

    // Получаем все мигрированные entities с managerId в data
    const logs = await this.dataSource.query(
      `SELECT lml."entityId", lml."legacyRequestId"
       FROM "legacy_migration_log" lml
       WHERE lml."status" = 'completed'`,
    );

    let updated = 0;
    const batchSize = 500;

    for (let i = 0; i < logs.length; i += batchSize) {
      const batch = logs.slice(i, i + batchSize);
      const requestIds = batch.map((l: { legacyRequestId: number }) => l.legacyRequestId);

      // Читаем managerId из legacy
      const requests = await this.legacyService.getRequestsByIds(requestIds);
      const requestMap = new Map(requests.map((r) => [r.id, r]));

      for (const log of batch) {
        const request = requestMap.get(log.legacyRequestId);
        if (!request?.managerId) continue;

        const assigneeId = mapping.managerMap.get(request.managerId);
        if (!assigneeId) continue;

        await this.dataSource.query(
          `UPDATE "entities" SET "assigneeId" = $1, "updatedAt" = NOW()
           WHERE "id" = $2 AND "assigneeId" IS NULL`,
          [assigneeId, log.entityId],
        );
        updated++;
      }
    }

    this.logger.log(`Assignees обновлены: ${updated} из ${logs.length}`);
    return { updated, total: logs.length };
  }

  cleanHtml(html: string): string {
    if (!html) return '';
    // Простая очистка HTML тегов
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
