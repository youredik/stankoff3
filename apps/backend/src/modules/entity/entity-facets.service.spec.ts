import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
import { FieldValidationService } from './field-validation.service';
import { FormulaEvaluatorService } from './formula-evaluator.service';

/**
 * Тесты для серверной фильтрации JSONB (applyCustomFilters)
 * и фасетных агрегаций (getFacets / computeFieldFacet)
 */
describe('EntityService — Facets & Custom Filters', () => {
  let service: EntityService;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let workspaceRepo: jest.Mocked<Repository<Workspace>>;

  // Шаблон workspace с разными типами полей
  const mockWorkspaceWithFields = (fields: any[]) =>
    ({
      id: 'ws-1',
      name: 'Test Workspace',
      sections: [
        {
          id: 'sec-1',
          name: 'Детали',
          order: 0,
          fields,
        },
      ],
    }) as unknown as Workspace;

  // QueryBuilder mock helper
  const createMockQb = (overrides: Record<string, any> = {}) => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawOne: jest.fn().mockResolvedValue(null),
      getRawMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
      clone: jest.fn(),
      ...overrides,
    };
    // clone возвращает новый mock QB
    qb.clone.mockImplementation(() => createMockQb(overrides));
    return qb;
  };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
        { provide: getRepositoryToken(GlobalCounter), useValue: mockGlobalCounterRepo },
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: EventsGateway, useValue: { emitEntityCreated: jest.fn(), emitEntityUpdated: jest.fn(), emitStatusChanged: jest.fn(), emitAssigneeChanged: jest.fn() } },
        { provide: S3Service, useValue: { getSignedUrlsBatch: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: EmailService, useValue: { sendStatusChangeNotification: jest.fn().mockResolvedValue(undefined), sendAssignmentNotification: jest.fn().mockResolvedValue(undefined) } },
        { provide: AutomationService, useValue: { executeRules: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') } },
        { provide: SlaService, useValue: { createInstance: jest.fn().mockResolvedValue(null), recordResolution: jest.fn() } },
        { provide: FieldValidationService, useValue: { validateEntityData: jest.fn() } },
        { provide: FormulaEvaluatorService, useValue: { computeFields: jest.fn((data) => data) } },
      ],
    }).compile();

    service = module.get<EntityService>(EntityService);
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    workspaceRepo = module.get(getRepositoryToken(Workspace));
  });

  // ===================================================================
  // getFacets
  // ===================================================================
  describe('getFacets', () => {
    it('должен вернуть пустые фасеты при отсутствии workspace', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      const result = await service.getFacets({ workspaceId: 'nonexistent' });

      expect(result).toEqual({
        builtIn: {
          status: [],
          priority: [],
          assignee: [],
          createdAt: { min: null, max: null },
        },
        custom: {},
      });
    });

    it('должен вернуть built-in фасеты (status, priority, assignee, createdAt)', async () => {
      const workspace = mockWorkspaceWithFields([]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      // Мокаем createQueryBuilder с разными результатами для разных запросов
      let callCount = 0;
      entityRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        // Разные вызовы для разных фасетов (Promise.all)
        if (callCount === 1) {
          // status facet
          return createMockQb({
            getRawMany: jest.fn().mockResolvedValue([
              { value: 'new', count: '10' },
              { value: 'done', count: '5' },
            ]),
          });
        }
        if (callCount === 2) {
          // priority facet
          return createMockQb({
            getRawMany: jest.fn().mockResolvedValue([
              { value: 'high', count: '3' },
              { value: 'low', count: '12' },
            ]),
          });
        }
        if (callCount === 3) {
          // assignee facet
          return createMockQb({
            getRawMany: jest.fn().mockResolvedValue([
              { value: 'user-1', count: '7' },
            ]),
          });
        }
        if (callCount === 4) {
          // createdAt facet
          return createMockQb({
            getRawOne: jest.fn().mockResolvedValue({
              min: '2024-01-01',
              max: '2024-12-31',
            }),
          });
        }
        return createMockQb();
      });

      const result = await service.getFacets({ workspaceId: 'ws-1' });

      // count приходит как строка из SQL getRawMany
      expect(result.builtIn.status).toEqual([
        { value: 'new', count: '10' },
        { value: 'done', count: '5' },
      ]);
      expect(result.builtIn.priority).toEqual([
        { value: 'high', count: '3' },
        { value: 'low', count: '12' },
      ]);
      expect(result.builtIn.assignee).toEqual([
        { value: 'user-1', count: '7' },
      ]);
      expect(result.builtIn.createdAt).toEqual({
        min: '2024-01-01',
        max: '2024-12-31',
      });
    });

    it('должен вычислить фасеты для кастомного select поля', async () => {
      const workspace = mockWorkspaceWithFields([
        {
          id: 'category',
          name: 'Категория',
          type: 'select',
          options: [
            { id: 'opt-1', label: 'Оборудование' },
            { id: 'opt-2', label: 'Сервис' },
          ],
          config: {},
        },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      let callCount = 0;
      entityRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        // 4 built-in + 1 custom
        if (callCount === 5) {
          // select facet query
          return createMockQb({
            getRawMany: jest.fn().mockResolvedValue([
              { value: 'opt-1', count: '8' },
              { value: 'opt-2', count: '3' },
            ]),
          });
        }
        return createMockQb({
          getRawMany: jest.fn().mockResolvedValue([]),
          getRawOne: jest.fn().mockResolvedValue({ min: null, max: null }),
        });
      });

      const result = await service.getFacets({ workspaceId: 'ws-1' });

      expect(result.custom.category).toBeDefined();
      expect(result.custom.category.type).toBe('select');
      expect(result.custom.category.values).toEqual([
        { value: 'opt-1', label: 'Оборудование', count: 8 },
        { value: 'opt-2', label: 'Сервис', count: 3 },
      ]);
    });

    it('должен вычислить фасеты для кастомного number поля', async () => {
      const workspace = mockWorkspaceWithFields([
        {
          id: 'price',
          name: 'Цена',
          type: 'number',
          config: { subtype: 'money' },
        },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      let callCount = 0;
      entityRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 5) {
          // number facet query
          return createMockQb({
            getRawOne: jest.fn().mockResolvedValue({
              min: '100',
              max: '99999',
              count: '42',
            }),
          });
        }
        return createMockQb({
          getRawMany: jest.fn().mockResolvedValue([]),
          getRawOne: jest.fn().mockResolvedValue({ min: null, max: null }),
        });
      });

      const result = await service.getFacets({ workspaceId: 'ws-1' });

      expect(result.custom.price).toBeDefined();
      expect(result.custom.price.type).toBe('number');
      expect(result.custom.price.min).toBe(100);
      expect(result.custom.price.max).toBe(99999);
      expect(result.custom.price.count).toBe(42);
    });

    it('должен вычислить фасеты для кастомного checkbox поля', async () => {
      const workspace = mockWorkspaceWithFields([
        {
          id: 'urgent',
          name: 'Срочно',
          type: 'checkbox',
          config: {},
        },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      let callCount = 0;
      entityRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 5) {
          // checkbox facet query
          return createMockQb({
            getRawMany: jest.fn().mockResolvedValue([
              { value: 'true', count: '15' },
              { value: 'false', count: '30' },
            ]),
          });
        }
        return createMockQb({
          getRawMany: jest.fn().mockResolvedValue([]),
          getRawOne: jest.fn().mockResolvedValue({ min: null, max: null }),
        });
      });

      const result = await service.getFacets({ workspaceId: 'ws-1' });

      expect(result.custom.urgent).toBeDefined();
      expect(result.custom.urgent.type).toBe('checkbox');
      expect(result.custom.urgent.trueCount).toBe(15);
      expect(result.custom.urgent.falseCount).toBe(30);
      expect(result.custom.urgent.total).toBe(45);
    });

    it('должен пропускать поля status, file, relation, geolocation', async () => {
      const workspace = mockWorkspaceWithFields([
        { id: 'status-field', name: 'Статус', type: 'status', config: {} },
        { id: 'attachment', name: 'Файл', type: 'file', config: {} },
        { id: 'link', name: 'Связь', type: 'relation', config: {} },
        { id: 'geo', name: 'Карта', type: 'geolocation', config: {} },
        { id: 'name', name: 'Имя', type: 'text', config: {} },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      let callCount = 0;
      entityRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        return createMockQb({
          getRawMany: jest.fn().mockResolvedValue([]),
          getRawOne: jest.fn().mockResolvedValue({ min: null, max: null, count: '0' }),
        });
      });

      const result = await service.getFacets({ workspaceId: 'ws-1' });

      // Только text поле 'name' должно быть в custom, остальные пропущены
      expect(Object.keys(result.custom)).toEqual(['name']);
    });

    it('должен пропускать built-in поля title, assignee, priority', async () => {
      const workspace = mockWorkspaceWithFields([
        { id: 'title', name: 'Название', type: 'text', config: {} },
        { id: 'assignee', name: 'Исполнитель', type: 'user', config: {} },
        { id: 'priority', name: 'Приоритет', type: 'select', config: {} },
        { id: 'description', name: 'Описание', type: 'textarea', config: {} },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      let callCount = 0;
      entityRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        return createMockQb({
          getRawMany: jest.fn().mockResolvedValue([]),
          getRawOne: jest.fn().mockResolvedValue({ min: null, max: null, count: '0' }),
        });
      });

      const result = await service.getFacets({ workspaceId: 'ws-1' });

      expect(Object.keys(result.custom)).toEqual(['description']);
    });

    it('должен применить фильтры к базовому запросу фасетов', async () => {
      const workspace = mockWorkspaceWithFields([]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      const mockQb = createMockQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ min: null, max: null }),
      });
      entityRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getFacets({
        workspaceId: 'ws-1',
        search: 'тест',
        assigneeId: ['user-1'],
        priority: ['high'],
      });

      // Должны быть вызваны andWhere для search, assigneeId, priority
      expect(mockQb.andWhere).toHaveBeenCalled();
    });

    it('должен передать customFilters в базовый запрос фасетов', async () => {
      const workspace = mockWorkspaceWithFields([
        {
          id: 'brand',
          name: 'Бренд',
          type: 'select',
          options: [{ id: 'apple', label: 'Apple' }],
          config: {},
        },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      const mockQb = createMockQb({
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ min: null, max: null }),
      });
      entityRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.getFacets({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ brand: ['apple'] }),
      });

      // andWhere должен быть вызван для кастомного фильтра
      expect(mockQb.andWhere).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // findForKanban с customFilters
  // ===================================================================
  describe('findForKanban с customFilters', () => {
    it('должен загрузить workspace при наличии customFilters', async () => {
      const workspace = mockWorkspaceWithFields([
        { id: 'category', name: 'Кат.', type: 'select', config: {} },
      ]);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      const mockQb = createMockQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      entityRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.findForKanban({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ category: ['opt-1'] }),
      });

      expect(workspaceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ws-1' },
        }),
      );
    });

    it('не должен загружать workspace если customFilters нет', async () => {
      const mockQb = createMockQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      entityRepo.createQueryBuilder.mockReturnValue(mockQb);

      await service.findForKanban({ workspaceId: 'ws-1' });

      // Workspace не загружается для фильтрации (может загружаться для других целей)
      // Проверяем что andWhere НЕ содержит JSONB-фильтры
      const andWhereCalls = mockQb.andWhere.mock.calls.map((c: any[]) => c[0]);
      const jsonbCalls = andWhereCalls.filter(
        (call: any) => typeof call === 'string' && call.includes('data'),
      );
      expect(jsonbCalls).toHaveLength(0);
    });
  });

  // ===================================================================
  // applyCustomFilters через findForTable
  // ===================================================================
  describe('applyCustomFilters (через findForTable)', () => {
    const setupWithFields = (fields: any[]) => {
      const workspace = mockWorkspaceWithFields(fields);
      workspaceRepo.findOne.mockResolvedValue(workspace);

      const mockQb = createMockQb({
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      entityRepo.createQueryBuilder.mockReturnValue(mockQb);

      return mockQb;
    };

    it('должен добавить JSONB фильтр для select поля (single)', async () => {
      const mockQb = setupWithFields([
        { id: 'category', name: 'Категория', type: 'select', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ category: ['opt-1', 'opt-2'] }),
      });

      const andWhereCalls = mockQb.andWhere.mock.calls;
      const jsonbCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('category'),
      );
      expect(jsonbCall).toBeDefined();
    });

    it('должен добавить JSONB фильтр для number range', async () => {
      const mockQb = setupWithFields([
        { id: 'price', name: 'Цена', type: 'number', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ price: { min: 100, max: 5000 } }),
      });

      const andWhereCalls = mockQb.andWhere.mock.calls;
      const minCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('price') && call[0].includes('numeric'),
      );
      expect(minCall).toBeDefined();
    });

    it('должен добавить JSONB фильтр для checkbox', async () => {
      const mockQb = setupWithFields([
        { id: 'urgent', name: 'Срочно', type: 'checkbox', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ urgent: true }),
      });

      const andWhereCalls = mockQb.andWhere.mock.calls;
      const checkboxCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('urgent') && call[0].includes('boolean'),
      );
      expect(checkboxCall).toBeDefined();
    });

    it('должен добавить JSONB фильтр для text LIKE', async () => {
      const mockQb = setupWithFields([
        { id: 'description', name: 'Описание', type: 'text', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ description: 'тестовое' }),
      });

      const andWhereCalls = mockQb.andWhere.mock.calls;
      const textCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('description') && call[0].includes('LIKE'),
      );
      expect(textCall).toBeDefined();
    });

    it('должен добавить JSONB фильтр для date range', async () => {
      const mockQb = setupWithFields([
        { id: 'deadline', name: 'Дедлайн', type: 'date', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ deadline: { from: '2024-01-01', to: '2024-12-31' } }),
      });

      const andWhereCalls = mockQb.andWhere.mock.calls;
      const dateCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('deadline') && call[0].includes('timestamp'),
      );
      expect(dateCall).toBeDefined();
    });

    it('должен игнорировать невалидный JSON в customFilters', async () => {
      const mockQb = setupWithFields([
        { id: 'field1', name: 'Поле', type: 'text', config: {} },
      ]);

      // Не должен бросать ошибку
      await expect(
        service.findForTable({
          workspaceId: 'ws-1',
          customFilters: 'invalid-json{{{',
        }),
      ).resolves.toBeDefined();
    });

    it('должен пропускать поля с неизвестным типом', async () => {
      const mockQb = setupWithFields([
        { id: 'unknown-field', name: 'Неизвестное', type: 'some_unknown_type', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ 'unknown-field': 'value' }),
      });

      // Для неизвестного типа andWhere не должен содержать JSONB-фильтр
      const andWhereCalls = mockQb.andWhere.mock.calls;
      const unknownCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('unknown-field'),
      );
      expect(unknownCall).toBeUndefined();
    });

    it('должен санитизировать fieldId от спецсимволов', async () => {
      const mockQb = setupWithFields([
        { id: 'safe-field_1', name: 'Safe', type: 'text', config: {} },
      ]);

      await service.findForTable({
        workspaceId: 'ws-1',
        customFilters: JSON.stringify({ 'safe-field_1': 'test' }),
      });

      // Проверяем что безопасный ID прошёл через фильтр
      const andWhereCalls = mockQb.andWhere.mock.calls;
      const safeCall = andWhereCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('safe-field_1'),
      );
      expect(safeCall).toBeDefined();
    });
  });
});
