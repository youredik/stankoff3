import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  LegacyMigrationService,
  MigrationProgress,
} from './legacy-migration.service';
import { LegacyService } from './legacy.service';
import { LegacyMigrationLog } from '../entities/legacy-migration-log.entity';
import { LegacyRequest } from '../entities/legacy-request.entity';
import { LegacyAnswer } from '../entities/legacy-answer.entity';
import { LegacyCustomer } from '../entities/legacy-customer.entity';
import { LegacyManager } from '../entities/legacy-manager.entity';
import { User, UserRole } from '../../user/user.entity';
import { Workspace } from '../../workspace/workspace.entity';

describe('LegacyMigrationService', () => {
  let service: LegacyMigrationService;
  let legacyService: jest.Mocked<LegacyService>;
  let migrationLogRepository: jest.Mocked<Repository<LegacyMigrationLog>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let workspaceRepository: jest.Mocked<Repository<Workspace>>;
  let mockDataSource: Record<string, jest.Mock>;
  let mockQueryRunner: Record<string, jest.Mock>;

  const createMockQueryBuilder = () => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      query: jest.fn().mockResolvedValue([]),
    };

    migrationLogRepository = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    } as unknown as jest.Mocked<Repository<LegacyMigrationLog>>;

    userRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((user) => ({
        id: 'system-user-uuid',
        ...user,
      })),
      create: jest.fn().mockImplementation((data) => data),
    } as unknown as jest.Mocked<Repository<User>>;

    workspaceRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((ws) => ({
        id: 'workspace-uuid',
        ...ws,
      })),
    } as unknown as jest.Mocked<Repository<Workspace>>;

    legacyService = {
      isAvailable: jest.fn().mockReturnValue(true),
      getRequestsCount: jest.fn().mockResolvedValue(0),
      getAllManagers: jest.fn().mockResolvedValue([]),
      getCustomersByIds: jest.fn().mockResolvedValue(new Map()),
      getRequestsWithAnswersBatch: jest.fn().mockResolvedValue(new Map()),
      getAllRequestsBatch: jest.fn().mockResolvedValue([]),
      getIndexingStats: jest.fn().mockResolvedValue({
        totalRequests: 0,
        closedRequests: 0,
        totalAnswers: 0,
        averageAnswersPerRequest: 0,
      }),
      getNewRequestsSince: jest.fn().mockResolvedValue([]),
      getRequestsByIds: jest.fn().mockResolvedValue([]),
      getRequestWithAnswers: jest.fn().mockResolvedValue({
        request: null,
        answers: [],
        customer: null,
      }),
    } as unknown as jest.Mocked<LegacyService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegacyMigrationService,
        { provide: LegacyService, useValue: legacyService },
        {
          provide: getRepositoryToken(LegacyMigrationLog),
          useValue: migrationLogRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(Workspace),
          useValue: workspaceRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<LegacyMigrationService>(LegacyMigrationService);
  });

  // ==================== mapStatus ====================

  describe('mapStatus', () => {
    it('должен вернуть "closed" если closed === 1', () => {
      const request = { closed: 1 } as LegacyRequest;
      expect(service.mapStatus(request)).toBe('closed');
    });

    it('должен вернуть "new" если closed === 0', () => {
      const request = { closed: 0 } as LegacyRequest;
      expect(service.mapStatus(request)).toBe('new');
    });
  });

  // ==================== cleanHtml ====================

  describe('cleanHtml', () => {
    it('должен удалять HTML теги', () => {
      expect(service.cleanHtml('<p>Текст</p>')).toBe('Текст');
    });

    it('должен заменять <br> на перенос строки', () => {
      expect(service.cleanHtml('Строка 1<br>Строка 2')).toBe(
        'Строка 1\nСтрока 2',
      );
    });

    it('должен заменять <br/> и <br /> на перенос строки', () => {
      expect(service.cleanHtml('A<br/>B<br />C')).toBe('A\nB\nC');
    });

    it('должен заменять </p> и </div> на перенос строки', () => {
      const result = service.cleanHtml(
        '<div>Блок 1</div><p>Параграф</p>',
      );
      expect(result).toContain('Блок 1');
      expect(result).toContain('Параграф');
    });

    it('должен декодировать &nbsp; в пробел', () => {
      expect(service.cleanHtml('Слово&nbsp;другое')).toBe('Слово другое');
    });

    it('должен декодировать &amp; в &', () => {
      expect(service.cleanHtml('A&amp;B')).toBe('A&B');
    });

    it('должен декодировать &lt; и &gt;', () => {
      expect(service.cleanHtml('&lt;tag&gt;')).toBe('<tag>');
    });

    it('должен декодировать &quot; и &#39;', () => {
      expect(service.cleanHtml('&quot;цитата&quot; и &#39;апостроф&#39;')).toBe(
        '"цитата" и \'апостроф\'',
      );
    });

    it('должен схлопывать тройные+ переносы строк в двойные', () => {
      expect(service.cleanHtml('A\n\n\n\nB')).toBe('A\n\nB');
    });

    it('должен обрезать пробелы по краям', () => {
      expect(service.cleanHtml('  текст  ')).toBe('текст');
    });

    it('должен вернуть пустую строку для пустого ввода', () => {
      expect(service.cleanHtml('')).toBe('');
    });

    it('должен вернуть пустую строку для null/undefined', () => {
      expect(service.cleanHtml(null as unknown as string)).toBe('');
      expect(service.cleanHtml(undefined as unknown as string)).toBe('');
    });

    it('должен обрабатывать сложный HTML', () => {
      const html =
        '<div class="msg"><p>Здравствуйте!</p><br><p>Ваша заявка &amp; запрос обработаны.</p></div>';
      const result = service.cleanHtml(html);
      expect(result).toContain('Здравствуйте!');
      expect(result).toContain('Ваша заявка & запрос обработаны.');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });
  });

  // ==================== buildUserMapping ====================

  describe('buildUserMapping', () => {
    it('должен создать маппинг сотрудников по email (регистронезависимо)', async () => {
      const managers: Partial<LegacyManager>[] = [
        { id: 1, userId: 100 },
        { id: 2, userId: 200 },
      ];
      legacyService.getAllManagers.mockResolvedValue(
        managers as LegacyManager[],
      );

      const customersMap = new Map<number, LegacyCustomer>();
      customersMap.set(100, {
        id: 100,
        email: 'Ivan@Test.RU',
      } as LegacyCustomer);
      customersMap.set(200, {
        id: 200,
        email: 'petr@test.ru',
      } as LegacyCustomer);
      legacyService.getCustomersByIds.mockResolvedValue(customersMap);

      const users: Partial<User>[] = [
        { id: 'user-1-uuid', email: 'ivan@test.ru' },
        { id: 'user-2-uuid', email: 'petr@test.ru' },
      ];
      userRepository.find.mockResolvedValue(users as User[]);

      // Системный пользователь уже существует
      userRepository.findOne.mockResolvedValue({
        id: 'system-uuid',
        email: 'legacy-system@stankoff.ru',
      } as User);

      const mapping = await service.buildUserMapping();

      expect(mapping.employeeMap.size).toBe(2);
      expect(mapping.employeeMap.get(100)).toBe('user-1-uuid');
      expect(mapping.employeeMap.get(200)).toBe('user-2-uuid');
      expect(mapping.managerMap.size).toBe(2);
      expect(mapping.managerMap.get(1)).toBe('user-1-uuid');
      expect(mapping.managerMap.get(2)).toBe('user-2-uuid');
      expect(mapping.unmappedCount).toBe(0);
      expect(mapping.systemUserId).toBe('system-uuid');
    });

    it('должен считать unmapped сотрудников без соответствия в PostgreSQL', async () => {
      const managers: Partial<LegacyManager>[] = [
        { id: 1, userId: 100 },
        { id: 2, userId: 200 },
      ];
      legacyService.getAllManagers.mockResolvedValue(
        managers as LegacyManager[],
      );

      const customersMap = new Map<number, LegacyCustomer>();
      customersMap.set(100, {
        id: 100,
        email: 'ivan@test.ru',
      } as LegacyCustomer);
      customersMap.set(200, {
        id: 200,
        email: 'unknown@legacy.ru',
      } as LegacyCustomer);
      legacyService.getCustomersByIds.mockResolvedValue(customersMap);

      // Только один пользователь существует
      userRepository.find.mockResolvedValue([
        { id: 'user-1-uuid', email: 'ivan@test.ru' },
      ] as User[]);

      userRepository.findOne.mockResolvedValue({
        id: 'system-uuid',
        email: 'legacy-system@stankoff.ru',
      } as User);

      const mapping = await service.buildUserMapping();

      expect(mapping.employeeMap.size).toBe(1);
      expect(mapping.managerMap.size).toBe(1);
      expect(mapping.managerMap.get(1)).toBe('user-1-uuid');
      expect(mapping.managerMap.has(2)).toBe(false);
      expect(mapping.unmappedCount).toBe(1);
    });

    it('должен создать системного пользователя если его нет', async () => {
      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue(null); // Системный пользователь не существует

      const mapping = await service.buildUserMapping();

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'legacy-system@stankoff.ru',
          firstName: 'Legacy',
          lastName: 'System',
          role: UserRole.EMPLOYEE,
          isActive: false,
        }),
      );
      expect(userRepository.save).toHaveBeenCalled();
      expect(mapping.systemUserId).toBe('system-user-uuid');
    });

    it('должен считать unmapped менеджеров без email', async () => {
      const managers: Partial<LegacyManager>[] = [{ id: 1, userId: 300 }];
      legacyService.getAllManagers.mockResolvedValue(
        managers as LegacyManager[],
      );

      // Клиент без email
      const customersMap = new Map<number, LegacyCustomer>();
      customersMap.set(300, {
        id: 300,
        email: null,
      } as unknown as LegacyCustomer);
      legacyService.getCustomersByIds.mockResolvedValue(customersMap);

      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys-id',
        email: 'legacy-system@stankoff.ru',
      } as User);

      const mapping = await service.buildUserMapping();

      expect(mapping.unmappedCount).toBe(1);
      expect(mapping.employeeMap.size).toBe(0);
      expect(mapping.managerMap.size).toBe(0);
    });
  });

  // ==================== updateAssignees ====================

  describe('updateAssignees', () => {
    it('должен обновить assignee для мигрированных entities', async () => {
      // Мок buildUserMapping
      const managers: Partial<LegacyManager>[] = [
        { id: 1, userId: 100 },
      ];
      legacyService.getAllManagers.mockResolvedValue(managers as LegacyManager[]);

      const customersMap = new Map<number, LegacyCustomer>();
      customersMap.set(100, { id: 100, email: 'ivan@test.ru' } as LegacyCustomer);
      legacyService.getCustomersByIds.mockResolvedValue(customersMap);

      userRepository.find.mockResolvedValue([
        { id: 'user-1-uuid', email: 'ivan@test.ru' },
      ] as User[]);
      userRepository.findOne.mockResolvedValue({
        id: 'system-uuid',
        email: 'legacy-system@stankoff.ru',
      } as User);

      // migration logs
      mockDataSource.query
        .mockResolvedValueOnce([
          { entityId: 'ent-1', legacyRequestId: 101 },
          { entityId: 'ent-2', legacyRequestId: 102 },
        ]) // SELECT legacy_migration_log
        .mockResolvedValueOnce(undefined); // UPDATE entities

      legacyService.getRequestsByIds = jest.fn().mockResolvedValue([
        { id: 101, managerId: 1 } as LegacyRequest,
        { id: 102, managerId: null } as unknown as LegacyRequest,
      ]);

      const result = await service.updateAssignees();

      expect(result.total).toBe(2);
      expect(result.updated).toBe(1);
    });

    it('должен вернуть 0 если managerMap пуст', async () => {
      legacyService.getAllManagers.mockResolvedValue([]);
      legacyService.getCustomersByIds.mockResolvedValue(new Map());
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'system-uuid',
        email: 'legacy-system@stankoff.ru',
      } as User);

      const result = await service.updateAssignees();

      expect(result).toEqual({ updated: 0, total: 0 });
    });
  });

  // ==================== ensureLegacyWorkspace ====================

  describe('ensureLegacyWorkspace', () => {
    it('должен вернуть существующий workspace если есть', async () => {
      const existingWorkspace = {
        id: 'existing-ws-id',
        name: 'Legacy CRM',
        prefix: 'LEG',
      } as Workspace;
      workspaceRepository.findOne.mockResolvedValue(existingWorkspace);

      const result = await service.ensureLegacyWorkspace();

      expect(result.id).toBe('existing-ws-id');
      expect(workspaceRepository.create).not.toHaveBeenCalled();
      expect(workspaceRepository.save).not.toHaveBeenCalled();
    });

    it('должен создать workspace если не существует', async () => {
      workspaceRepository.findOne.mockResolvedValue(null);

      const result = await service.ensureLegacyWorkspace();

      expect(workspaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Legacy CRM (Миграция)',
          icon: expect.any(String),
          prefix: 'LEG',
          lastEntityNumber: 0,
          isInternal: true,
        }),
      );
      expect(workspaceRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('workspace-uuid');
    });

    it('должен создать workspace с правильными секциями полей', async () => {
      workspaceRepository.findOne.mockResolvedValue(null);

      await service.ensureLegacyWorkspace();

      const createCall = workspaceRepository.create.mock.calls[0][0] as any;
      expect(createCall.sections).toHaveLength(3);
      expect(createCall.sections[0].id).toBe('main');
      expect(createCall.sections[1].id).toBe('customer');
      expect(createCall.sections[2].id).toBe('counterparty');
    });
  });

  // ==================== getPreview ====================

  describe('getPreview', () => {
    it('должен вернуть статистику миграции', async () => {
      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getRequestsCount.mockResolvedValue(1000);
      legacyService.getIndexingStats.mockResolvedValue({
        totalRequests: 1000,
        closedRequests: 800,
        totalAnswers: 5000,
        averageAnswersPerRequest: 5,
      });
      migrationLogRepository.count.mockResolvedValue(200);

      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys',
        email: 'legacy-system@stankoff.ru',
      } as User);

      workspaceRepository.findOne.mockResolvedValue({
        id: 'ws-id',
        prefix: 'LEG',
      } as Workspace);

      const preview = await service.getPreview();

      expect(preview.legacyRequestsCount).toBe(1000);
      expect(preview.legacyAnswersCount).toBe(5000);
      expect(preview.alreadyMigratedCount).toBe(200);
      expect(preview.remainingCount).toBe(800);
      expect(preview.workspaceExists).toBe(true);
      expect(preview.workspaceId).toBe('ws-id');
    });

    it('должен вернуть нули если legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);
      migrationLogRepository.count.mockResolvedValue(0);

      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys',
        email: 'legacy-system@stankoff.ru',
      } as User);
      workspaceRepository.findOne.mockResolvedValue(null);

      const preview = await service.getPreview();

      expect(preview.legacyRequestsCount).toBe(0);
      expect(preview.legacyAnswersCount).toBe(0);
      expect(preview.workspaceExists).toBe(false);
      expect(preview.workspaceId).toBeNull();
    });
  });

  // ==================== startMigration ====================

  describe('startMigration', () => {
    beforeEach(() => {
      // Подготовка для buildUserMapping и ensureLegacyWorkspace
      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys-uuid',
        email: 'legacy-system@stankoff.ru',
      } as User);
      workspaceRepository.findOne.mockResolvedValue(null);
      legacyService.getRequestsCount.mockResolvedValue(100);
    });

    it('должен выбросить ошибку если миграция уже запущена', async () => {
      // Запускаем миграцию первый раз — getAllRequestsBatch не резолвится сразу,
      // чтобы миграция оставалась в состоянии isRunning
      let resolveBatch: (value: LegacyRequest[]) => void;
      legacyService.getAllRequestsBatch.mockReturnValue(
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
      );

      await service.startMigration();

      // Пытаемся запустить ещё раз — isRunning === true
      await expect(service.startMigration()).rejects.toThrow(
        'Миграция уже запущена',
      );

      // Разрешаем батч чтобы очистить промис
      resolveBatch!([] as LegacyRequest[]);
    });

    it('должен выбросить ошибку если legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);

      await expect(service.startMigration()).rejects.toThrow(
        'Legacy БД недоступна',
      );
    });

    it('должен вернуть сообщение о dry run без запуска миграции', async () => {
      const result = await service.startMigration({ dryRun: true });

      expect(result.message).toContain('Dry run');
      expect(result.message).toContain('100');
      // Прогресс не должен быть isRunning
      const progress = service.getProgress();
      expect(progress.isRunning).toBe(false);
      expect(progress.completedAt).not.toBeNull();
    });

    it('должен инициализировать прогресс при запуске', async () => {
      legacyService.getRequestsCount.mockResolvedValue(500);
      legacyService.getAllRequestsBatch.mockResolvedValue([]);

      const result = await service.startMigration({ batchSize: 100 });

      expect(result.message).toContain('500');
      expect(result.message).toContain('100');
    });

    it('должен ограничить количество заявок через maxRequests', async () => {
      legacyService.getRequestsCount.mockResolvedValue(1000);
      legacyService.getAllRequestsBatch.mockResolvedValue([]);

      await service.startMigration({ dryRun: true, maxRequests: 50 });

      const progress = service.getProgress();
      expect(progress.totalRequests).toBe(50);
    });
  });

  // ==================== stopMigration ====================

  describe('stopMigration', () => {
    it('должен вернуть сообщение если миграция не запущена', () => {
      const result = service.stopMigration();
      expect(result.message).toBe('Миграция не запущена');
    });

    it('должен установить флаг остановки при запущенной миграции', async () => {
      // Подготовка
      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys',
        email: 'legacy-system@stankoff.ru',
      } as User);
      workspaceRepository.findOne.mockResolvedValue(null);
      legacyService.getRequestsCount.mockResolvedValue(10000);

      // Симулируем долгий батч: getAllRequestsBatch никогда не резолвится сразу
      let resolveFirstBatch: (value: LegacyRequest[]) => void;
      legacyService.getAllRequestsBatch.mockReturnValue(
        new Promise((resolve) => {
          resolveFirstBatch = resolve;
        }),
      );

      await service.startMigration({ batchSize: 100 });

      const result = service.stopMigration();
      expect(result.message).toContain('Остановка');

      // Разрешаем батч чтобы очистить промис
      resolveFirstBatch!([] as LegacyRequest[]);
    });
  });

  // ==================== migrateBatchRequests ====================

  describe('migrateBatchRequests', () => {
    beforeEach(async () => {
      // Инициализируем userMapping и workspaceId через startMigration dryRun
      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys-uuid',
        email: 'legacy-system@stankoff.ru',
      } as User);
      workspaceRepository.findOne.mockResolvedValue(null);
      legacyService.getRequestsCount.mockResolvedValue(10);

      await service.startMigration({ dryRun: true });
    });

    it('должен пропустить уже мигрированные заявки', async () => {
      const requests: Partial<LegacyRequest>[] = [
        {
          id: 1,
          customerId: 100,
          subject: 'Тест',
          closed: 0,
          createdAt: new Date(),
        },
        {
          id: 2,
          customerId: 200,
          subject: 'Тест 2',
          closed: 0,
          createdAt: new Date(),
        },
      ];

      // Оба уже мигрированы
      mockQueryRunner.query.mockResolvedValueOnce([
        { legacyRequestId: 1 },
        { legacyRequestId: 2 },
      ]);

      const result = await service.migrateBatchRequests(
        requests as LegacyRequest[],
      );

      expect(result.skipped).toBe(2);
      expect(result.processed).toBe(0);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('должен мигрировать новые заявки с комментариями', async () => {
      const requests: Partial<LegacyRequest>[] = [
        {
          id: 10,
          customerId: 100,
          subject: 'Новая заявка',
          closed: 0,
          type: 'support',
          managerId: 0,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      // Не мигрирован
      mockQueryRunner.query.mockResolvedValueOnce([]);

      // Ответы
      const answersMap = new Map();
      answersMap.set(10, {
        request: requests[0],
        answers: [
          {
            id: 1,
            requestId: 10,
            customerId: 500,
            isClient: 0,
            text: '<p>Ответ</p>',
            createdAt: new Date('2024-01-01T10:00:00'),
          } as LegacyAnswer,
        ],
      });
      legacyService.getRequestsWithAnswersBatch.mockResolvedValue(answersMap);

      // Клиенты
      const customersMap = new Map<number, LegacyCustomer>();
      customersMap.set(100, {
        id: 100,
        firstName: 'Иван',
        lastName: 'Иванов',
        email: 'ivan@test.ru',
        phone: '79001234567',
        defaultCounterpartyId: 0,
      } as LegacyCustomer);
      legacyService.getCustomersByIds.mockResolvedValue(customersMap);

      const result = await service.migrateBatchRequests(
        requests as LegacyRequest[],
      );

      expect(result.processed).toBe(1);
      expect(result.commentsCreated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('должен обработать ошибку отдельной заявки без остановки батча', async () => {
      const requests: Partial<LegacyRequest>[] = [
        {
          id: 20,
          customerId: 100,
          subject: 'Хорошая',
          closed: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          managerId: 0,
        },
        {
          id: 21,
          customerId: 200,
          subject: 'Проблемная',
          closed: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          managerId: 0,
        },
      ];

      // Ни одна не мигрирована
      mockQueryRunner.query.mockResolvedValueOnce([]);

      legacyService.getRequestsWithAnswersBatch.mockResolvedValue(new Map());
      legacyService.getCustomersByIds.mockResolvedValue(new Map());

      // Первый INSERT entity — ок, второй — ошибка
      let queryCallCount = 0;
      mockQueryRunner.query.mockImplementation(
        (sql: string, params?: any[]) => {
          queryCallCount++;
          // Первый вызов — SELECT для проверки миграции (уже прошёл)
          // INSERT entity для первой заявки — ок
          // INSERT для второй заявки — ошибка
          if (
            queryCallCount > 1 &&
            sql.includes('INSERT INTO "entities"') &&
            params &&
            params[1]?.includes('LEG-21')
          ) {
            throw new Error('Ошибка вставки');
          }
          return Promise.resolve([]);
        },
      );

      const result = await service.migrateBatchRequests(
        requests as LegacyRequest[],
      );

      // Первая заявка успешно, вторая — с ошибкой
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('должен выбросить ошибку если миграция не инициализирована', async () => {
      // Создаём новый экземпляр сервиса без инициализации
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyMigrationService,
          { provide: LegacyService, useValue: legacyService },
          {
            provide: getRepositoryToken(LegacyMigrationLog),
            useValue: migrationLogRepository,
          },
          { provide: getRepositoryToken(User), useValue: userRepository },
          {
            provide: getRepositoryToken(Workspace),
            useValue: workspaceRepository,
          },
          { provide: DataSource, useValue: mockDataSource },
        ],
      }).compile();

      const uninitializedService = module.get<LegacyMigrationService>(
        LegacyMigrationService,
      );

      await expect(
        uninitializedService.migrateBatchRequests([
          { id: 1 } as LegacyRequest,
        ]),
      ).rejects.toThrow('Миграция не инициализирована');
    });

    it('должен откатить транзакцию при фатальной ошибке', async () => {
      // Имитируем фатальную ошибку на уровне query runner
      mockQueryRunner.query.mockRejectedValue(new Error('Database crash'));

      await expect(
        service.migrateBatchRequests([
          {
            id: 99,
            customerId: 1,
            closed: 0,
            createdAt: new Date(),
          } as LegacyRequest,
        ]),
      ).rejects.toThrow('Database crash');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // ==================== validateMigration ====================

  describe('validateMigration', () => {
    it('должен вернуть нули если workspace не существует', async () => {
      workspaceRepository.findOne.mockResolvedValue(null);

      const result = await service.validateMigration();

      expect(result.entitiesCreated).toBe(0);
      expect(result.legacyTotal).toBe(0);
      expect(result.coveragePercent).toBe(0);
    });

    it('должен вернуть статистику валидации', async () => {
      workspaceRepository.findOne.mockResolvedValue({
        id: 'ws-id',
        prefix: 'LEG',
      } as Workspace);

      const qb = createMockQueryBuilder();
      qb.getCount.mockResolvedValue(500);
      mockDataSource.createQueryBuilder.mockReturnValue(qb);

      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getRequestsCount.mockResolvedValue(1000);

      migrationLogRepository.count
        .mockResolvedValueOnce(500) // completed
        .mockResolvedValueOnce(10); // failed

      // Для spot-check
      migrationLogRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      const result = await service.validateMigration();

      expect(result.entitiesCreated).toBe(500);
      expect(result.legacyTotal).toBe(1000);
      expect(result.migrationLogCompleted).toBe(500);
      expect(result.migrationLogFailed).toBe(10);
      expect(result.coveragePercent).toBe(50);
    });

    it('должен проводить spot-check и считать integrity errors', async () => {
      workspaceRepository.findOne.mockResolvedValue({
        id: 'ws-id',
        prefix: 'LEG',
      } as Workspace);

      const qb = createMockQueryBuilder();
      qb.getCount.mockResolvedValue(100);
      mockDataSource.createQueryBuilder.mockReturnValue(qb);

      legacyService.isAvailable.mockReturnValue(true);
      legacyService.getRequestsCount.mockResolvedValue(200);

      migrationLogRepository.count
        .mockResolvedValueOnce(100) // completed
        .mockResolvedValueOnce(5); // failed

      // Spot-check: 2 записи, одна без entity
      const sampleLogs = [
        { legacyRequestId: 1, entityId: 'entity-1' },
        { legacyRequestId: 2, entityId: 'entity-2' },
      ];
      migrationLogRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sampleLogs),
      } as any);

      // Для spot-check query builder
      const spotQb = createMockQueryBuilder();
      // Первый entity найден, второй — нет
      spotQb.getRawOne
        .mockResolvedValueOnce({ title: 'Заявка 1' })
        .mockResolvedValueOnce(null);
      mockDataSource.createQueryBuilder
        .mockReturnValueOnce(qb) // для getCount
        .mockReturnValueOnce(spotQb) // для первого spot check
        .mockReturnValueOnce(spotQb); // переиспользуется для второго spot check (возвращает null уже)

      // На самом деле createQueryBuilder вызывается каждый раз заново
      // Нужно mock вернуть разные query builders
      const spotQb1 = createMockQueryBuilder();
      spotQb1.getRawOne.mockResolvedValue({ title: 'Заявка 1' });
      const spotQb2 = createMockQueryBuilder();
      spotQb2.getRawOne.mockResolvedValue(null);

      mockDataSource.createQueryBuilder
        .mockReturnValueOnce(qb) // для getCount
        .mockReturnValueOnce(spotQb1) // entity-1
        .mockReturnValueOnce(spotQb2); // entity-2

      const result = await service.validateMigration();

      expect(result.sampleSize).toBeLessThanOrEqual(100);
      expect(result.integrityErrors).toBe(1);
    });
  });

  // ==================== getMigrationLog ====================

  describe('getMigrationLog', () => {
    it('должен вернуть лог с пагинацией по умолчанию', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          legacyRequestId: 1,
          entityId: 'e-1',
          status: 'completed',
          migratedAt: new Date(),
        },
      ] as LegacyMigrationLog[];

      migrationLogRepository.findAndCount.mockResolvedValue([mockLogs, 1]);

      const result = await service.getMigrationLog();

      expect(migrationLogRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        order: { migratedAt: 'DESC' },
        skip: 0,
        take: 50,
      });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('должен фильтровать по статусу', async () => {
      migrationLogRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getMigrationLog({ status: 'failed' });

      expect(migrationLogRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'failed' },
        }),
      );
    });

    it('должен применять пользовательские limit и offset', async () => {
      migrationLogRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getMigrationLog({ limit: 10, offset: 20 });

      expect(migrationLogRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  // ==================== getProgress ====================

  describe('getProgress', () => {
    it('должен вернуть копию прогресса, а не ссылку', () => {
      const progress1 = service.getProgress();
      const progress2 = service.getProgress();

      expect(progress1).toEqual(progress2);
      expect(progress1).not.toBe(progress2); // разные объекты
    });

    it('должен вернуть начальное состояние по умолчанию', () => {
      const progress = service.getProgress();

      expect(progress.totalRequests).toBe(0);
      expect(progress.processedRequests).toBe(0);
      expect(progress.isRunning).toBe(false);
      expect(progress.startedAt).toBeNull();
      expect(progress.completedAt).toBeNull();
      expect(progress.error).toBeNull();
    });

    it('не должен позволять изменять внутренний прогресс извне', () => {
      const progress = service.getProgress();
      progress.totalRequests = 99999;

      const freshProgress = service.getProgress();
      expect(freshProgress.totalRequests).toBe(0);
    });
  });

  // ==================== retryFailed ====================

  describe('retryFailed', () => {
    it('должен выбросить ошибку если миграция уже запущена', async () => {
      // Запускаем миграцию
      legacyService.getAllManagers.mockResolvedValue([]);
      userRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: 'sys',
        email: 'legacy-system@stankoff.ru',
      } as User);
      workspaceRepository.findOne.mockResolvedValue(null);
      legacyService.getRequestsCount.mockResolvedValue(100);

      let resolve: (v: LegacyRequest[]) => void;
      legacyService.getAllRequestsBatch.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );

      await service.startMigration({ batchSize: 50 });

      await expect(service.retryFailed()).rejects.toThrow(
        'Миграция уже запущена',
      );

      resolve!([] as LegacyRequest[]);
    });

    it('должен выбросить ошибку если legacy БД недоступна', async () => {
      legacyService.isAvailable.mockReturnValue(false);

      await expect(service.retryFailed()).rejects.toThrow(
        'Legacy БД недоступна',
      );
    });

    it('должен вернуть сообщение если нет ошибочных записей', async () => {
      migrationLogRepository.find.mockResolvedValue([]);

      const result = await service.retryFailed();

      expect(result.message).toBe('Нет ошибочных записей');
      expect(result.retried).toBe(0);
    });
  });
});
