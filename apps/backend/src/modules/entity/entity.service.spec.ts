import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityService } from './entity.service';
import { WorkspaceEntity } from './entity.entity';
import { GlobalCounter } from './global-counter.entity';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';
import { AutomationService } from '../automation/automation.service';
import { SlaService } from '../sla/sla.service';

describe('EntityService', () => {
  let service: EntityService;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let globalCounterRepo: jest.Mocked<Repository<GlobalCounter>>;
  let workspaceRepo: jest.Mocked<Repository<Workspace>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let dataSource: { transaction: jest.Mock };
  let eventsGateway: jest.Mocked<EventsGateway>;
  let s3Service: jest.Mocked<S3Service>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let emailService: jest.Mocked<EmailService>;
  let automationService: jest.Mocked<AutomationService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    password: 'hashed',
    role: 'user',
    keycloakId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;

  const mockWorkspace = {
    id: 'ws-1',
    name: 'Test Workspace',
    description: 'Test',
    prefix: 'TST',
    ownerId: 'user-1',
    statusConfig: [],
    fieldConfig: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Workspace;

  const mockEntity = {
    id: 'entity-1',
    customId: 'TST-1',
    workspaceId: 'ws-1',
    workspace: mockWorkspace,
    title: 'Test Entity',
    status: 'new',
    priority: 'medium',
    assigneeId: null,
    assignee: undefined,
    data: {},
    linkedEntityIds: [],
    comments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    commentCount: 0,
    lastActivityAt: undefined,
    firstResponseAt: undefined,
    resolvedAt: undefined,
    searchVector: undefined,
  } as unknown as WorkspaceEntity;

  beforeEach(async () => {
    const mockEntityRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockGlobalCounterRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockWorkspaceRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const mockUserRepo = {
      findOne: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn(),
    };

    const mockEventsGateway = {
      emitEntityCreated: jest.fn(),
      emitEntityUpdated: jest.fn(),
      emitStatusChanged: jest.fn(),
      emitAssigneeChanged: jest.fn(),
    };

    const mockS3Service = {
      getSignedUrlsBatch: jest.fn(),
    };

    const mockAuditLogService = {
      log: jest.fn(),
    };

    const mockEmailService = {
      sendStatusChangeNotification: jest.fn().mockResolvedValue(undefined),
      sendAssignmentNotification: jest.fn().mockResolvedValue(undefined),
    };

    const mockAutomationService = {
      executeRules: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };

    const mockSlaService = {
      createInstance: jest.fn().mockResolvedValue(null),
      recordResolution: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
        { provide: getRepositoryToken(GlobalCounter), useValue: mockGlobalCounterRepo },
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventsGateway, useValue: mockEventsGateway },
        { provide: S3Service, useValue: mockS3Service },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AutomationService, useValue: mockAutomationService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SlaService, useValue: mockSlaService },
      ],
    }).compile();

    service = module.get<EntityService>(EntityService);
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    workspaceRepo = module.get(getRepositoryToken(Workspace));
    userRepo = module.get(getRepositoryToken(User));
    dataSource = module.get(DataSource);
    eventsGateway = module.get(EventsGateway);
    s3Service = module.get(S3Service);
    auditLogService = module.get(AuditLogService);
    emailService = module.get(EmailService);
    automationService = module.get(AutomationService);
  });

  describe('findAll', () => {
    it('должен вернуть все entities', async () => {
      entityRepo.find.mockResolvedValue([mockEntity]);

      const result = await service.findAll();

      expect(result).toEqual([mockEntity]);
      expect(entityRepo.find).toHaveBeenCalledWith({
        where: {},
        relations: ['assignee'],
        order: { createdAt: 'DESC' },
      });
    });

    it('должен фильтровать по workspaceId', async () => {
      entityRepo.find.mockResolvedValue([mockEntity]);

      await service.findAll('ws-1');

      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        relations: ['assignee'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('должен вернуть entity по ID', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);

      const result = await service.findOne('entity-1');

      expect(result).toEqual(mockEntity);
    });

    it('должен выбросить NotFoundException если entity не найден', async () => {
      entityRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('должен генерировать signed URLs для вложений в комментариях', async () => {
      const entityWithComments = {
        ...mockEntity,
        comments: [
          {
            id: 'comment-1',
            content: 'Test',
            attachments: [
              { id: 'att-1', name: 'file.pdf', size: 1000, mimeType: 'application/pdf', key: 's3-key-1' },
            ],
          },
        ],
      };
      entityRepo.findOne.mockResolvedValue(entityWithComments as any);
      s3Service.getSignedUrlsBatch.mockResolvedValue(new Map([['s3-key-1', 'https://signed-url']]));

      const result = await service.findOne('entity-1');

      expect(s3Service.getSignedUrlsBatch).toHaveBeenCalledWith(['s3-key-1']);
      expect(result.comments[0].attachments[0].url).toBe('https://signed-url');
    });
  });

  describe('create', () => {
    it('должен создать entity с автогенерированным customId', async () => {
      const mockManager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(mockWorkspace) // workspace
          .mockResolvedValueOnce({ name: 'entity_number', value: 5 }), // counter
        create: jest.fn().mockReturnValue(mockEntity),
        save: jest.fn().mockResolvedValue(mockEntity),
        createQueryBuilder: jest.fn(),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(mockManager as any));
      entityRepo.findOne.mockResolvedValue(mockEntity);
      automationService.executeRules.mockResolvedValue(undefined);

      const dto = { workspaceId: 'ws-1', title: 'New Entity', status: 'new', data: {} };
      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(mockEntity);
      expect(eventsGateway.emitEntityCreated).toHaveBeenCalledWith(mockEntity);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('должен выбросить NotFoundException если workspace не найден', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(mockManager as any));

      const dto = { workspaceId: 'non-existent', title: 'Test', status: 'new', data: {} };

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('должен создать новый счётчик если он не существует', async () => {
      const mockManager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(mockWorkspace)
          .mockResolvedValueOnce(null), // counter doesn't exist
        create: jest.fn().mockImplementation((entity, data) => data),
        save: jest.fn().mockResolvedValue(mockEntity),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ maxNum: 10 }),
        }),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(mockManager as any));
      entityRepo.findOne.mockResolvedValue(mockEntity);
      automationService.executeRules.mockResolvedValue(undefined);

      const dto = { workspaceId: 'ws-1', title: 'Test', status: 'new', data: {} };
      await service.create(dto);

      // Проверяем что счётчик был создан (create вызван для GlobalCounter)
      expect(mockManager.create).toHaveBeenCalledWith(
        GlobalCounter,
        expect.objectContaining({ name: 'entity_number' }),
      );
    });
  });

  describe('update', () => {
    it('должен обновить entity', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);

      const dto = { title: 'Updated Title' };
      await service.update('entity-1', dto, 'user-1');

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', dto);
      expect(eventsGateway.emitEntityUpdated).toHaveBeenCalled();
    });

    it('должен логировать изменения если есть actorId', async () => {
      const currentEntity = { ...mockEntity, title: 'Old Title' };
      entityRepo.findOne.mockResolvedValue(currentEntity);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.update('entity-1', { title: 'New Title' }, 'user-1');

      expect(auditLogService.log).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('должен обновить статус и отправить событие', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      automationService.executeRules.mockResolvedValue(undefined);

      await service.updateStatus('entity-1', 'in_progress', 'user-1');

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', { status: 'in_progress' });
      expect(eventsGateway.emitStatusChanged).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('должен отправить email исполнителю при изменении статуса', async () => {
      const entityWithAssignee = { ...mockEntity, assigneeId: 'user-2', status: 'new' };
      entityRepo.findOne.mockResolvedValue(entityWithAssignee);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      userRepo.findOne.mockResolvedValue(mockUser);
      automationService.executeRules.mockResolvedValue(undefined);

      await service.updateStatus('entity-1', 'done', 'user-1');

      expect(emailService.sendStatusChangeNotification).toHaveBeenCalled();
    });

    it('не должен отправлять email если исполнитель сам изменил статус', async () => {
      const entityWithAssignee = { ...mockEntity, assigneeId: 'user-1' };
      entityRepo.findOne.mockResolvedValue(entityWithAssignee);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      automationService.executeRules.mockResolvedValue(undefined);

      await service.updateStatus('entity-1', 'done', 'user-1');

      expect(emailService.sendStatusChangeNotification).not.toHaveBeenCalled();
    });
  });

  describe('updateAssignee', () => {
    it('должен назначить исполнителя', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      automationService.executeRules.mockResolvedValue(undefined);

      await service.updateAssignee('entity-1', 'user-2', 'user-1');

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', { assigneeId: 'user-2' });
      expect(eventsGateway.emitAssigneeChanged).toHaveBeenCalled();
    });

    it('должен отправить email новому исполнителю', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      userRepo.findOne.mockResolvedValue(mockUser);
      automationService.executeRules.mockResolvedValue(undefined);

      await service.updateAssignee('entity-1', 'user-2', 'user-1');

      expect(emailService.sendAssignmentNotification).toHaveBeenCalled();
    });

    it('должен снять исполнителя (null)', async () => {
      const entityWithAssignee = { ...mockEntity, assigneeId: 'user-2' };
      entityRepo.findOne.mockResolvedValue(entityWithAssignee);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      automationService.executeRules.mockResolvedValue(undefined);

      await service.updateAssignee('entity-1', null, 'user-1');

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', { assigneeId: null });
    });
  });

  describe('remove', () => {
    it('должен удалить entity', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      entityRepo.remove.mockResolvedValue(mockEntity);

      await service.remove('entity-1', 'user-1');

      expect(entityRepo.remove).toHaveBeenCalledWith(mockEntity);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('должен выбросить NotFoundException если entity не найден', async () => {
      entityRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeTestData', () => {
    it('должен удалить тестовые данные по паттернам', async () => {
      const testEntities = [
        { ...mockEntity, title: 'Playwright Test' },
        { ...mockEntity, title: '[E2E] Test' },
      ];
      entityRepo.find.mockResolvedValue(testEntities);
      entityRepo.remove.mockResolvedValue(testEntities as any);

      const result = await service.removeTestData();

      expect(result.deleted).toBe(2);
      expect(entityRepo.remove).toHaveBeenCalledWith(testEntities);
    });

    it('должен вернуть 0 если нет тестовых данных', async () => {
      entityRepo.find.mockResolvedValue([mockEntity]);

      const result = await service.removeTestData();

      expect(result.deleted).toBe(0);
      expect(entityRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('должен искать entities по query', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEntity]),
      };
      entityRepo.createQueryBuilder.mockReturnValue(mockQb as any);
      workspaceRepo.find.mockResolvedValue([mockWorkspace]);

      const result = await service.search('test', ['ws-1'], 10);

      expect(result.entities).toEqual([mockEntity]);
      expect(result.workspaces.get('ws-1')).toEqual(mockWorkspace);
    });
  });

  describe('exportToCsv', () => {
    it('должен экспортировать entities в CSV формат', async () => {
      const entityWithAssignee = { ...mockEntity, assignee: mockUser };
      entityRepo.find.mockResolvedValue([entityWithAssignee]);

      const result = await service.exportToCsv('ws-1');

      expect(result).toContain('ID;Номер;Название;Статус;Приоритет;Исполнитель;Создано');
      expect(result).toContain(mockEntity.id);
      expect(result).toContain('Test User');
    });
  });

  describe('exportToJson', () => {
    it('должен экспортировать entities в JSON формат', async () => {
      entityRepo.find.mockResolvedValue([mockEntity]);

      const result = await service.exportToJson('ws-1');

      expect(result).toHaveProperty('exportedAt');
      expect(result).toHaveProperty('workspaceId', 'ws-1');
      expect(result).toHaveProperty('count', 1);
      expect(result).toHaveProperty('entities');
    });
  });

  describe('importFromCsv', () => {
    it('должен импортировать entities из CSV', async () => {
      const csv = 'ID;Номер;Название;Статус;Приоритет\n;;"Test Import";new;medium';

      const mockManager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(mockWorkspace)
          .mockResolvedValueOnce({ name: 'entity_number', value: 1 }),
        create: jest.fn().mockReturnValue(mockEntity),
        save: jest.fn().mockResolvedValue(mockEntity),
        createQueryBuilder: jest.fn(),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(mockManager as any));
      entityRepo.findOne.mockResolvedValue(mockEntity);
      automationService.executeRules.mockResolvedValue(undefined);

      const result = await service.importFromCsv('ws-1', csv, 'user-1');

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('должен вернуть ошибку для пустого CSV', async () => {
      const result = await service.importFromCsv('ws-1', '', 'user-1');

      expect(result.imported).toBe(0);
      expect(result.errors).toContain('Файл пуст или содержит только заголовки');
    });

    it('должен вернуть ошибку для строки без названия', async () => {
      const csv = 'ID;Номер;Название;Статус\n;;;"new"';

      const result = await service.importFromCsv('ws-1', csv, 'user-1');

      expect(result.errors).toContain('Строка 2: название не указано');
    });

    it('должен обрабатывать CSV с кавычками', async () => {
      const csv = 'ID;Номер;Название;Статус\n;;"Title with ""quotes""";new';

      const mockManager = {
        findOne: jest.fn()
          .mockResolvedValueOnce(mockWorkspace)
          .mockResolvedValueOnce({ name: 'entity_number', value: 1 }),
        create: jest.fn().mockReturnValue(mockEntity),
        save: jest.fn().mockResolvedValue(mockEntity),
        createQueryBuilder: jest.fn(),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(mockManager as any));
      entityRepo.findOne.mockResolvedValue(mockEntity);
      automationService.executeRules.mockResolvedValue(undefined);

      const result = await service.importFromCsv('ws-1', csv, 'user-1');

      expect(result.imported).toBe(1);
    });
  });
});
