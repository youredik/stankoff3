import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { LegacySyncService, SyncResult } from './legacy-sync.service';
import { LegacyService } from './legacy.service';
import { LegacyMigrationService } from './legacy-migration.service';
import { LegacyMigrationLog } from '../entities/legacy-migration-log.entity';
import { LegacyRequest } from '../entities/legacy-request.entity';
import { Workspace } from '../../workspace/workspace.entity';

describe('LegacySyncService', () => {
  let service: LegacySyncService;
  let legacyService: jest.Mocked<LegacyService>;
  let migrationService: jest.Mocked<LegacyMigrationService>;
  let migrationLogRepository: jest.Mocked<Repository<LegacyMigrationLog>>;
  let workspaceRepository: jest.Mocked<Repository<Workspace>>;
  let dataSource: jest.Mocked<DataSource>;

  const createMockQueryBuilder = (results: any[] = []) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(results),
    };
    return qb as unknown as SelectQueryBuilder<any>;
  };

  const createLegacyRequest = (overrides: Partial<LegacyRequest> = {}): LegacyRequest => {
    const req = new LegacyRequest();
    req.id = overrides.id ?? 100;
    req.customerId = overrides.customerId ?? 1;
    req.managerId = overrides.managerId ?? 2;
    req.subject = overrides.subject ?? 'Тестовая заявка';
    req.type = overrides.type ?? 'support';
    req.closed = overrides.closed ?? 0;
    req.createdAt = overrides.createdAt ?? new Date('2024-01-01');
    req.updatedAt = overrides.updatedAt ?? new Date('2024-01-02');
    return req;
  };

  const createMigrationLog = (overrides: Partial<LegacyMigrationLog> = {}): LegacyMigrationLog => {
    const log = new LegacyMigrationLog();
    log.id = overrides.id ?? 'log-uuid-1';
    log.legacyRequestId = overrides.legacyRequestId ?? 100;
    log.entityId = overrides.entityId ?? 'entity-uuid-1';
    log.commentsCount = overrides.commentsCount ?? 0;
    log.status = overrides.status ?? 'completed';
    log.errorMessage = overrides.errorMessage ?? null;
    log.migratedAt = overrides.migratedAt ?? new Date();
    return log;
  };

  const mockWorkspace: Partial<Workspace> = {
    id: 'workspace-uuid-1',
    name: 'Legacy CRM',
    prefix: 'LEG',
  };

  beforeEach(async () => {
    legacyService = {
      isAvailable: jest.fn().mockReturnValue(true),
      getNewRequestsSince: jest.fn().mockResolvedValue([]),
      getNewAnswersSince: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LegacyService>;

    migrationService = {
      migrateBatchRequests: jest.fn().mockResolvedValue({
        processed: 0,
        skipped: 0,
        failed: 0,
        commentsCreated: 0,
      }),
      mapStatus: jest.fn().mockReturnValue('new'),
      cleanHtml: jest.fn((html: string) => html),
      buildUserMapping: jest.fn().mockResolvedValue({
        employeeMap: new Map(),
        systemUserId: 'system-user-uuid',
        unmappedCount: 0,
      }),
    } as unknown as jest.Mocked<LegacyMigrationService>;

    migrationLogRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<LegacyMigrationLog>>;

    workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(mockWorkspace),
    } as unknown as jest.Mocked<Repository<Workspace>>;

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegacySyncService,
        { provide: LegacyService, useValue: legacyService },
        { provide: LegacyMigrationService, useValue: migrationService },
        {
          provide: getRepositoryToken(LegacyMigrationLog),
          useValue: migrationLogRepository,
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: workspaceRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<LegacySyncService>(LegacySyncService);
  });

  // ==================== getStatus() ====================

  describe('getStatus()', () => {
    it('должен вернуть корректное начальное состояние', () => {
      const status = service.getStatus();

      expect(status).toEqual({
        enabled: false,
        lastSyncAt: null,
        lastSyncResult: null,
        totalSynced: 0,
      });
    });

    it('должен отражать изменения после enable()', () => {
      service.enable();
      const status = service.getStatus();

      expect(status.enabled).toBe(true);
    });

    it('должен обновлять состояние после успешной синхронизации', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getNewRequestsSince.mockResolvedValue([]);

      await service.runSync();

      const status = service.getStatus();
      expect(status.lastSyncAt).toBeInstanceOf(Date);
      expect(status.lastSyncResult).not.toBeNull();
    });
  });

  // ==================== enable() / disable() ====================

  describe('enable() / disable()', () => {
    it('должен включать синхронизацию и возвращать сообщение', () => {
      const result = service.enable();

      expect(result).toEqual({ message: 'Legacy sync включён' });
      expect(service.getStatus().enabled).toBe(true);
    });

    it('должен выключать синхронизацию и возвращать сообщение', () => {
      service.enable();
      const result = service.disable();

      expect(result).toEqual({ message: 'Legacy sync выключен' });
      expect(service.getStatus().enabled).toBe(false);
    });

    it('должен корректно переключать состояние многократно', () => {
      service.enable();
      expect(service.getStatus().enabled).toBe(true);

      service.disable();
      expect(service.getStatus().enabled).toBe(false);

      service.enable();
      expect(service.getStatus().enabled).toBe(true);
    });
  });

  // ==================== runSync() ====================

  describe('runSync()', () => {
    it('должен пропустить синхронизацию когда legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);

      const result = await service.runSync();

      expect(result.newRequests).toBe(0);
      expect(result.updatedRequests).toBe(0);
      expect(result.newComments).toBe(0);
      expect(result.errors).toBe(0);
      expect(legacyService.getNewRequestsSince).not.toHaveBeenCalled();
    });

    it('должен завершиться без операций когда нет новых заявок', async () => {
      legacyService.getNewRequestsSince.mockResolvedValue([]);

      const result = await service.runSync();

      expect(result.newRequests).toBe(0);
      expect(result.updatedRequests).toBe(0);
      expect(workspaceRepository.findOne).not.toHaveBeenCalled();
    });

    it('должен пропустить синхронизацию когда workspace LEG не найден', async () => {
      const request = createLegacyRequest({ id: 1 });
      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      workspaceRepository.findOne.mockResolvedValue(null);

      const result = await service.runSync();

      expect(result.newRequests).toBe(0);
      expect(migrationService.migrateBatchRequests).not.toHaveBeenCalled();
    });

    it('должен мигрировать новые заявки через migrationService', async () => {
      const request1 = createLegacyRequest({ id: 1 });
      const request2 = createLegacyRequest({ id: 2 });
      legacyService.getNewRequestsSince.mockResolvedValue([request1, request2]);

      // Нет существующих логов — обе заявки новые
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      migrationService.migrateBatchRequests.mockResolvedValue({
        processed: 2,
        skipped: 0,
        failed: 0,
        commentsCreated: 5,
      });

      const result = await service.runSync();

      expect(result.newRequests).toBe(2);
      expect(result.newComments).toBe(5);
      expect(result.errors).toBe(0);
      expect(migrationService.migrateBatchRequests).toHaveBeenCalledWith(
        [request1, request2],
      );
    });

    it('должен обновить существующие заявки (статус)', async () => {
      const request = createLegacyRequest({
        id: 100,
        closed: 1,
        updatedAt: new Date('2024-06-01'),
      });
      const log = createMigrationLog({
        legacyRequestId: 100,
        entityId: 'entity-uuid-100',
      });

      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([log]),
      );

      migrationService.mapStatus.mockReturnValue('closed');

      const result = await service.runSync();

      expect(result.updatedRequests).toBe(1);
      expect(result.newRequests).toBe(0);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "entities"'),
        ['closed', request.updatedAt, 'entity-uuid-100'],
      );
    });

    it('должен обрабатывать смесь новых и существующих заявок', async () => {
      const newRequest = createLegacyRequest({ id: 1 });
      const existingRequest = createLegacyRequest({ id: 100 });
      const log = createMigrationLog({
        legacyRequestId: 100,
        entityId: 'entity-uuid-100',
      });

      legacyService.getNewRequestsSince.mockResolvedValue([
        newRequest,
        existingRequest,
      ]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([log]),
      );

      migrationService.migrateBatchRequests.mockResolvedValue({
        processed: 1,
        skipped: 0,
        failed: 0,
        commentsCreated: 2,
      });

      const result = await service.runSync();

      expect(result.newRequests).toBe(1);
      expect(result.updatedRequests).toBe(1);
      expect(result.newComments).toBe(2);
      expect(migrationService.migrateBatchRequests).toHaveBeenCalledWith(
        [newRequest],
      );
    });

    it('должен увеличивать totalSynced после каждой синхронизации', async () => {
      const request = createLegacyRequest({ id: 1 });
      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );
      migrationService.migrateBatchRequests.mockResolvedValue({
        processed: 1,
        skipped: 0,
        failed: 0,
        commentsCreated: 0,
      });

      await service.runSync();
      expect(service.getStatus().totalSynced).toBe(1);

      await service.runSync();
      expect(service.getStatus().totalSynced).toBe(2);
    });

    it('должен вернуть предыдущий результат при повторном вызове во время синхронизации', async () => {
      // Эмулируем длительную синхронизацию: getNewRequestsSince зависает
      let resolveRequests: (value: LegacyRequest[]) => void;
      const pendingRequests = new Promise<LegacyRequest[]>((resolve) => {
        resolveRequests = resolve;
      });

      legacyService.getNewRequestsSince.mockReturnValue(pendingRequests);

      // Запускаем первую синхронизацию (она "зависнет")
      const firstSync = service.runSync();

      // Запускаем вторую синхронизацию — должен вернуться пустой результат
      const secondResult = await service.runSync();
      expect(secondResult.newRequests).toBe(0);
      expect(secondResult.updatedRequests).toBe(0);

      // Завершаем первую синхронизацию
      resolveRequests!([]);
      await firstSync;
    });
  });

  // ==================== scheduledSync() ====================

  describe('scheduledSync()', () => {
    it('должен пропустить выполнение когда синхронизация выключена', async () => {
      // По умолчанию enabled = false
      await service.scheduledSync();

      expect(legacyService.isAvailable).not.toHaveBeenCalled();
      expect(legacyService.getNewRequestsSince).not.toHaveBeenCalled();
    });

    it('должен выполнить runSync когда синхронизация включена', async () => {
      service.enable();
      legacyService.getNewRequestsSince.mockResolvedValue([]);

      await service.scheduledSync();

      expect(legacyService.isAvailable).toHaveBeenCalled();
    });

    it('должен выполнить полный цикл при наличии данных', async () => {
      service.enable();

      const request = createLegacyRequest({ id: 1 });
      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );
      migrationService.migrateBatchRequests.mockResolvedValue({
        processed: 1,
        skipped: 0,
        failed: 0,
        commentsCreated: 0,
      });

      await service.scheduledSync();

      const status = service.getStatus();
      expect(status.totalSynced).toBe(1);
      expect(status.lastSyncResult).not.toBeNull();
      expect(status.lastSyncResult!.newRequests).toBe(1);
    });
  });

  // ==================== Обработка ошибок ====================

  describe('обработка ошибок', () => {
    it('должен обработать ошибку миграции новых заявок (graceful degradation)', async () => {
      const request1 = createLegacyRequest({ id: 1 });
      const request2 = createLegacyRequest({ id: 2 });
      legacyService.getNewRequestsSince.mockResolvedValue([request1, request2]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      migrationService.migrateBatchRequests.mockRejectedValue(
        new Error('Ошибка подключения к БД'),
      );

      const result = await service.runSync();

      expect(result.errors).toBe(2); // Обе заявки считаются ошибочными
      expect(result.newRequests).toBe(0);
    });

    it('должен обработать ошибку обновления отдельной заявки и продолжить', async () => {
      const request1 = createLegacyRequest({ id: 100 });
      const request2 = createLegacyRequest({ id: 200 });
      const log1 = createMigrationLog({
        legacyRequestId: 100,
        entityId: 'entity-1',
      });
      const log2 = createMigrationLog({
        legacyRequestId: 200,
        entityId: 'entity-2',
      });

      legacyService.getNewRequestsSince.mockResolvedValue([request1, request2]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([log1, log2]),
      );

      // Первый вызов query (UPDATE) бросает ошибку, последующие — ОК
      let callCount = 0;
      dataSource.query.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Ошибка при обновлении entity');
        }
        return [];
      });

      const result = await service.runSync();

      // Первая заявка — ошибка, вторая — успех
      expect(result.errors).toBe(1);
      expect(result.updatedRequests).toBe(1);
    });

    it('должен обработать глобальную ошибку и сбросить флаг isSyncing', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getNewRequestsSince.mockRejectedValue(
        new Error('Неожиданная ошибка'),
      );

      const result = await service.runSync();

      expect(result.errors).toBeGreaterThanOrEqual(1);

      // Проверяем, что isSyncing сброшен — повторный вызов работает
      legacyService.getNewRequestsSince.mockResolvedValue([]);
      const result2 = await service.runSync();
      expect(result2.errors).toBe(0);
    });

    it('должен корректно обработать частичные ошибки в migrateBatchRequests', async () => {
      const request = createLegacyRequest({ id: 1 });
      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      migrationService.migrateBatchRequests.mockResolvedValue({
        processed: 0,
        skipped: 0,
        failed: 1,
        commentsCreated: 0,
      });

      const result = await service.runSync();

      expect(result.errors).toBe(1);
      expect(result.newRequests).toBe(0);
    });
  });

  // ==================== syncExistingRequest (через runSync) ====================

  describe('синхронизация новых ответов для существующих заявок', () => {
    it('должен добавить новые комментарии из legacy ответов', async () => {
      // Сначала делаем первичную синхронизацию, чтобы установить lastSyncAt
      legacyService.getNewRequestsSince.mockResolvedValueOnce([]);
      await service.runSync();

      // Теперь делаем вторую — с существующей заявкой
      const request = createLegacyRequest({ id: 100 });
      const log = createMigrationLog({
        legacyRequestId: 100,
        entityId: 'entity-uuid-100',
      });

      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([log]),
      );

      const mockAnswer = {
        id: 500,
        requestId: 100,
        customerId: 10,
        text: '<p>Ответ от сотрудника</p>',
        isClient: 0,
        createdAt: new Date('2024-06-15'),
      };
      legacyService.getNewAnswersSince.mockResolvedValue([mockAnswer as any]);

      // Нет дублей
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT "id" FROM "comments"')) {
          return []; // Нет дублей
        }
        if (sql.includes('SELECT COUNT')) {
          return [{ count: '3' }];
        }
        return [];
      });

      migrationService.buildUserMapping.mockResolvedValue({
        employeeMap: new Map([[10, 'user-uuid-10']]),
        systemUserId: 'system-uuid',
        unmappedCount: 0,
      });
      migrationService.cleanHtml.mockReturnValue('Ответ от сотрудника');

      const result = await service.runSync();

      expect(result.updatedRequests).toBe(1);
      expect(legacyService.getNewAnswersSince).toHaveBeenCalled();
      expect(migrationService.cleanHtml).toHaveBeenCalledWith('<p>Ответ от сотрудника</p>');

      // Проверяем INSERT в comments
      const insertCall = dataSource.query.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO "comments"'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual(
        expect.arrayContaining([
          'entity-uuid-100',
          'user-uuid-10',
          'Ответ от сотрудника',
        ]),
      );
    });

    it('должен пропустить пустые ответы', async () => {
      // Устанавливаем lastSyncAt
      legacyService.getNewRequestsSince.mockResolvedValueOnce([]);
      await service.runSync();

      const request = createLegacyRequest({ id: 100 });
      const log = createMigrationLog({
        legacyRequestId: 100,
        entityId: 'entity-uuid-100',
      });

      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([log]),
      );

      const emptyAnswer = {
        id: 501,
        requestId: 100,
        customerId: 10,
        text: '   ',
        isClient: 0,
        createdAt: new Date(),
      };
      legacyService.getNewAnswersSince.mockResolvedValue([emptyAnswer as any]);

      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT COUNT')) {
          return [{ count: '0' }];
        }
        return [];
      });

      const result = await service.runSync();

      expect(result.updatedRequests).toBe(1);
      // INSERT не должен вызываться для пустого ответа
      const insertCall = dataSource.query.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO "comments"'),
      );
      expect(insertCall).toBeUndefined();
    });

    it('должен не дублировать уже существующие комментарии', async () => {
      // Устанавливаем lastSyncAt
      legacyService.getNewRequestsSince.mockResolvedValueOnce([]);
      await service.runSync();

      const request = createLegacyRequest({ id: 100 });
      const log = createMigrationLog({
        legacyRequestId: 100,
        entityId: 'entity-uuid-100',
      });

      legacyService.getNewRequestsSince.mockResolvedValue([request]);
      migrationLogRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([log]),
      );

      const answer = {
        id: 502,
        requestId: 100,
        customerId: 10,
        text: 'Уже существующий ответ',
        isClient: 0,
        createdAt: new Date('2024-06-15'),
      };
      legacyService.getNewAnswersSince.mockResolvedValue([answer as any]);

      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT "id" FROM "comments"')) {
          return [{ id: 'existing-comment-uuid' }]; // Дубль найден
        }
        if (sql.includes('SELECT COUNT')) {
          return [{ count: '1' }];
        }
        return [];
      });

      await service.runSync();

      // INSERT не должен вызываться — комментарий уже существует
      const insertCall = dataSource.query.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO "comments"'),
      );
      expect(insertCall).toBeUndefined();
    });
  });
});
