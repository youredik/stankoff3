import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SeedShowcase } from './seed-showcase';
import { User, UserRole } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Comment } from './modules/entity/comment.entity';
import { Workspace } from './modules/workspace/workspace.entity';
import { WorkspaceMember } from './modules/workspace/workspace-member.entity';
import { Section } from './modules/section/section.entity';
import { SectionMember } from './modules/section/section-member.entity';
import { SlaDefinition } from './modules/sla/entities/sla-definition.entity';
import { SlaInstance } from './modules/sla/entities/sla-instance.entity';
import { DecisionTable } from './modules/dmn/entities/decision-table.entity';
import { ProcessDefinition } from './modules/bpmn/entities/process-definition.entity';
import { ProcessTrigger } from './modules/bpmn/entities/process-trigger.entity';
import { EntityLink } from './modules/bpmn/entities/entity-link.entity';
import { AutomationRule } from './modules/automation/automation-rule.entity';
import { UserGroup } from './modules/bpmn/entities/user-group.entity';
import { BpmnService } from './modules/bpmn/bpmn.service';

function createMockRepository() {
  return {
    save: jest.fn().mockImplementation((data) => {
      if (Array.isArray(data)) {
        return Promise.resolve(data.map((item, i) => ({ id: `uuid-${i}`, ...item })));
      }
      return Promise.resolve({ id: 'uuid-generated', ...data });
    }),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((data) => ({ ...data, members: [] })),
  };
}

describe('SeedShowcase', () => {
  let service: SeedShowcase;
  let userRepo: ReturnType<typeof createMockRepository>;
  let workspaceRepo: ReturnType<typeof createMockRepository>;
  let entityRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let sectionRepo: ReturnType<typeof createMockRepository>;
  let sectionMemberRepo: ReturnType<typeof createMockRepository>;
  let commentRepo: ReturnType<typeof createMockRepository>;
  let slaDefRepo: ReturnType<typeof createMockRepository>;
  let slaInstRepo: ReturnType<typeof createMockRepository>;
  let dmnTableRepo: ReturnType<typeof createMockRepository>;
  let processDefRepo: ReturnType<typeof createMockRepository>;
  let triggerRepo: ReturnType<typeof createMockRepository>;
  let linkRepo: ReturnType<typeof createMockRepository>;
  let automationRepo: ReturnType<typeof createMockRepository>;
  let userGroupRepo: ReturnType<typeof createMockRepository>;
  let mockDataSource: { query: jest.Mock };
  let mockBpmnService: {
    waitForConnection: jest.Mock;
    deployDefinition: jest.Mock;
    startProcess: jest.Mock;
    isZeebeConnected: jest.Mock;
  };

  beforeEach(async () => {
    userRepo = createMockRepository();
    workspaceRepo = createMockRepository();
    entityRepo = createMockRepository();
    memberRepo = createMockRepository();
    sectionRepo = createMockRepository();
    sectionMemberRepo = createMockRepository();
    commentRepo = createMockRepository();
    slaDefRepo = createMockRepository();
    slaInstRepo = createMockRepository();
    dmnTableRepo = createMockRepository();
    processDefRepo = createMockRepository();
    triggerRepo = createMockRepository();
    linkRepo = createMockRepository();
    automationRepo = createMockRepository();
    userGroupRepo = createMockRepository();
    mockDataSource = { query: jest.fn().mockResolvedValue([]) };
    mockBpmnService = {
      waitForConnection: jest.fn().mockResolvedValue(undefined),
      deployDefinition: jest.fn().mockResolvedValue({
        id: 'pd-0',
        deployedKey: '2251799813685249',
        version: 1,
        deployedAt: new Date(),
      }),
      startProcess: jest.fn().mockResolvedValue({
        id: 'pi-0',
        processInstanceKey: '4503599627370496',
        status: 'ACTIVE',
      }),
      isZeebeConnected: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedShowcase,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Workspace), useValue: workspaceRepo },
        { provide: getRepositoryToken(WorkspaceEntity), useValue: entityRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: memberRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(SectionMember), useValue: sectionMemberRepo },
        { provide: getRepositoryToken(Comment), useValue: commentRepo },
        { provide: getRepositoryToken(SlaDefinition), useValue: slaDefRepo },
        { provide: getRepositoryToken(SlaInstance), useValue: slaInstRepo },
        { provide: getRepositoryToken(DecisionTable), useValue: dmnTableRepo },
        { provide: getRepositoryToken(ProcessDefinition), useValue: processDefRepo },
        { provide: getRepositoryToken(ProcessTrigger), useValue: triggerRepo },
        { provide: getRepositoryToken(EntityLink), useValue: linkRepo },
        { provide: getRepositoryToken(AutomationRule), useValue: automationRepo },
        { provide: getRepositoryToken(UserGroup), useValue: userGroupRepo },
        { provide: BpmnService, useValue: mockBpmnService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<SeedShowcase>(SeedShowcase);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('должен пропустить если секция HR уже существует', async () => {
      sectionRepo.findOne.mockResolvedValue({ id: 'existing', name: 'HR' });
      userRepo.count.mockResolvedValue(5);

      await service.onModuleInit();

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(mockBpmnService.waitForConnection).not.toHaveBeenCalled();
    });

    it('должен пропустить если нет пользователей (base seed не запущен)', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(0);

      await service.onModuleInit();

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(sectionRepo.save).not.toHaveBeenCalled();
      expect(mockBpmnService.waitForConnection).not.toHaveBeenCalled();
    });

    it('должен ожидать Zeebe подключения перед seed', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });
      setupSeedMocks();

      await service.onModuleInit();

      expect(mockBpmnService.waitForConnection).toHaveBeenCalledWith(30000);
    });

    it('должен падать если Zeebe не подключён', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      mockBpmnService.waitForConnection.mockRejectedValue(
        new Error('Zeebe connection not established within 30000ms'),
      );

      await expect(service.onModuleInit()).rejects.toThrow('Zeebe connection not established');
      expect(sectionRepo.save).not.toHaveBeenCalled();
    });

    it('должен запустить cleanup и seed когда условия выполнены', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });
      setupSeedMocks();

      await service.onModuleInit();

      expect(mockDataSource.query).toHaveBeenCalled();
      const deleteQueries = mockDataSource.query.mock.calls.filter(
        (c: any) => typeof c[0] === 'string' && c[0].includes('DELETE'),
      );
      expect(deleteQueries.length).toBeGreaterThan(0);
      expect(sectionRepo.save).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('должен удалять данные в правильном порядке зависимостей', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });
      setupSeedMocks();

      await service.onModuleInit();

      const queries = mockDataSource.query.mock.calls.map((c: any) => c[0] as string);
      const deleteQueries = queries.filter((q: string) => q.includes('DELETE'));

      const linkIdx = deleteQueries.findIndex((q: string) => q.includes('entity_links'));
      const logIdx = deleteQueries.findIndex((q: string) => q.includes('process_activity_logs'));
      const instIdx = deleteQueries.findIndex((q: string) => q.includes('process_instances'));
      const defIdx = deleteQueries.findIndex((q: string) => q.includes('process_definitions'));

      expect(linkIdx).toBeLessThan(instIdx);
      expect(logIdx).toBeLessThan(instIdx);
      expect(instIdx).toBeLessThan(defIdx);
    });

    it('должен удалять ВСЕ данные включая Legacy', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });
      setupSeedMocks();

      await service.onModuleInit();

      const queries = mockDataSource.query.mock.calls.map((c: any) => c[0] as string);

      // Не должно быть фильтров по prefix LEG
      const legFilters = queries.filter((q: string) => q.includes('LEG'));
      expect(legFilters).toHaveLength(0);

      // Workspaces удаляются безусловно
      const wsDelete = queries.find((q: string) =>
        q.includes('"workspaces"') && q.includes('DELETE') && !q.includes('workspace_members'),
      );
      expect(wsDelete).toBeDefined();
      expect(wsDelete).not.toContain('prefix');
    });

    it('должен сохранять только admin пользователя', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });
      setupSeedMocks();

      await service.onModuleInit();

      const queries = mockDataSource.query.mock.calls.map((c: any) => c[0] as string);
      const userDeleteQuery = queries.find(
        (q: string) => q.includes('"users"') && q.includes('DELETE'),
      );
      expect(userDeleteQuery).toBeDefined();
      expect(userDeleteQuery).toContain('admin@stankoff.ru');
      expect(userDeleteQuery).not.toContain('legacy-system@stankoff.ru');
    });
  });

  describe('seed', () => {
    beforeEach(() => {
      userRepo.count.mockResolvedValue(4);
      setupSeedMocks();
    });

    it('должен создать 20 пользователей', async () => {
      await service.seed();

      expect(userRepo.save).toHaveBeenCalledTimes(20);
    });

    it('должен создать пользователей трёх отделов: HR, Финансы, Коммерческий', async () => {
      await service.seed();

      const savedEmails = userRepo.save.mock.calls.map((c: any) => c[0].email);
      expect(savedEmails).toContain('antonova@stankoff.ru');
      expect(savedEmails).toContain('zhukova@stankoff.ru');
      expect(savedEmails).toContain('zakharov@stankoff.ru');
      expect(savedEmails).toContain('osipov@stankoff.ru');
      expect(savedEmails).toContain('polyakova@stankoff.ru');
      expect(savedEmails).toContain('filippov@stankoff.ru');
    });

    it('должен создать 3 секции (HR, Финансы, Коммерческий)', async () => {
      await service.seed();

      expect(sectionRepo.save).toHaveBeenCalledTimes(3);
      const names = sectionRepo.save.mock.calls.map((c: any) => c[0].name);
      expect(names).toContain('HR');
      expect(names).toContain('Финансы');
      expect(names).toContain('Коммерческий');
    });

    it('должен создать 4 workspace (OTP, FIN, PO, KP)', async () => {
      await service.seed();

      expect(workspaceRepo.save).toHaveBeenCalledTimes(4);
      const prefixes = workspaceRepo.save.mock.calls.map((c: any) => c[0].prefix);
      expect(prefixes).toContain('OTP');
      expect(prefixes).toContain('FIN');
      expect(prefixes).toContain('PO');
      expect(prefixes).toContain('KP');
    });

    it('OTP workspace должен иметь 6 статусов', async () => {
      await service.seed();

      const otpCall = workspaceRepo.save.mock.calls.find(
        (c: any) => c[0].prefix === 'OTP',
      );
      expect(otpCall).toBeDefined();
      const statusField = otpCall![0].sections[0].fields.find(
        (f: any) => f.id === 'status',
      );
      expect(statusField).toBeDefined();
      expect(statusField.options).toHaveLength(6);
      expect(statusField.options.map((o: any) => o.id)).toEqual([
        'pending', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed',
      ]);
    });

    it('FIN workspace должен иметь 7 статусов', async () => {
      await service.seed();

      const finCall = workspaceRepo.save.mock.calls.find(
        (c: any) => c[0].prefix === 'FIN',
      );
      expect(finCall).toBeDefined();
      const statusField = finCall![0].sections[0].fields.find(
        (f: any) => f.id === 'status',
      );
      expect(statusField).toBeDefined();
      expect(statusField.options).toHaveLength(7);
    });

    it('PO workspace должен иметь 9 статусов', async () => {
      await service.seed();

      const poCall = workspaceRepo.save.mock.calls.find(
        (c: any) => c[0].prefix === 'PO',
      );
      expect(poCall).toBeDefined();
      const statusField = poCall![0].sections[0].fields.find(
        (f: any) => f.id === 'status',
      );
      expect(statusField).toBeDefined();
      expect(statusField.options).toHaveLength(9);
    });

    it('KP workspace должен иметь 7 статусов', async () => {
      await service.seed();

      const kpCall = workspaceRepo.save.mock.calls.find(
        (c: any) => c[0].prefix === 'KP',
      );
      expect(kpCall).toBeDefined();
      const statusField = kpCall![0].sections[0].fields.find(
        (f: any) => f.id === 'status',
      );
      expect(statusField).toBeDefined();
      expect(statusField.options).toHaveLength(7);
    });

    it('должен создать 4 process definitions', async () => {
      await service.seed();

      const pdCall = processDefRepo.save.mock.calls[0][0];
      expect(Array.isArray(pdCall)).toBe(true);
      expect(pdCall).toHaveLength(4);

      const processIds = pdCall.map((d: any) => d.processId);
      expect(processIds).toContain('vacation-request');
      expect(processIds).toContain('expense-approval');
      expect(processIds).toContain('purchase-order');
      expect(processIds).toContain('simple-approval');
    });

    it('должен задеплоить 4 process definitions в Zeebe', async () => {
      await service.seed();

      expect(mockBpmnService.deployDefinition).toHaveBeenCalledTimes(4);
    });

    it('должен создать 4 триггера ENTITY_CREATED', async () => {
      await service.seed();

      const triggerCall = triggerRepo.save.mock.calls[0][0];
      expect(Array.isArray(triggerCall)).toBe(true);
      expect(triggerCall).toHaveLength(4);
      triggerCall.forEach((t: any) => {
        expect(t.triggerType).toBe('entity_created');
      });
    });

    it('должен создать 8 SLA definitions (2 на workspace)', async () => {
      await service.seed();

      const slaCall = slaDefRepo.save.mock.calls[0][0];
      expect(Array.isArray(slaCall)).toBe(true);
      expect(slaCall).toHaveLength(8);
    });

    it('должен создать 4 DMN таблицы', async () => {
      await service.seed();

      const dmnCall = dmnTableRepo.save.mock.calls[0][0];
      expect(Array.isArray(dmnCall)).toBe(true);
      expect(dmnCall).toHaveLength(4);

      const names = dmnCall.map((d: any) => d.name);
      expect(names).toContain('Маршрутизация отпусков');
      expect(names).toContain('Лимиты расходов');
      expect(names).toContain('Скоринг поставщиков');
      expect(names).toContain('Квалификация сделок');
    });

    it('DMN таблицы должны иметь разные hitPolicy', async () => {
      await service.seed();

      const dmnCall = dmnTableRepo.save.mock.calls[0][0];
      const policies = dmnCall.map((d: any) => d.hitPolicy);
      expect(policies).toContain('FIRST');
      expect(policies).toContain('COLLECT');
      expect(policies).toContain('RULE_ORDER');
    });

    it('должен создать automation rules', async () => {
      await service.seed();

      expect(automationRepo.save).toHaveBeenCalled();
      const rules = automationRepo.save.mock.calls[0][0];
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThanOrEqual(6);
    });

    it('должен создать ~140 entities в 4 workspace', async () => {
      await service.seed();

      const entityCalls = entityRepo.save.mock.calls;
      expect(entityCalls).toHaveLength(4);

      const totalEntities = entityCalls.reduce(
        (sum: number, c: any) => sum + (Array.isArray(c[0]) ? c[0].length : 1),
        0,
      );
      expect(totalEntities).toBe(140);
    });

    it('entities должны иметь customId вида PREFIX-N', async () => {
      await service.seed();

      const otpBatch = entityRepo.save.mock.calls[0][0];
      const customIds = otpBatch.map((e: any) => e.customId);
      expect(customIds).toContain('OTP-1');
      expect(customIds).toContain('OTP-35');
    });

    it('должен создать комментарии', async () => {
      await service.seed();

      expect(commentRepo.save).toHaveBeenCalled();
      const totalComments = commentRepo.save.mock.calls.length;
      expect(totalComments).toBeGreaterThan(0);
    });

    it('должен создать SLA instances', async () => {
      await service.seed();

      expect(slaInstRepo.save).toHaveBeenCalled();
    });

    it('должен запустить реальные Zeebe процессы для всех entities', async () => {
      await service.seed();

      // 140 entities = 35 OTP + 35 FIN + 35 PO + 35 KP
      expect(mockBpmnService.startProcess).toHaveBeenCalledTimes(140);
    });

    it('должен передавать корректные переменные при запуске процессов', async () => {
      await service.seed();

      const calls = mockBpmnService.startProcess.mock.calls;
      // Каждый вызов имеет definitionId, variables, options
      for (const call of calls) {
        const [, variables, options] = call;
        expect(variables.entityId).toBeDefined();
        expect(variables.title).toBeDefined();
        expect(options.entityId).toBeDefined();
        expect(options.businessKey).toBeDefined();
        expect(options.startedById).toBeDefined();
      }
    });

    it('должен создать entity links (cross-workspace)', async () => {
      await service.seed();

      expect(linkRepo.save).toHaveBeenCalled();
      const links = linkRepo.save.mock.calls[0][0];
      expect(Array.isArray(links)).toBe(true);
      expect(links.length).toBeGreaterThan(0);
    });

    it('должен создать workspace members', async () => {
      await service.seed();

      expect(memberRepo.save).toHaveBeenCalled();
    });

    it('должен создать user groups', async () => {
      await service.seed();

      expect(userGroupRepo.create).toHaveBeenCalled();
      expect(userGroupRepo.save).toHaveBeenCalled();
    });

    it('должен создать section members включая admin', async () => {
      await service.seed();

      expect(sectionMemberRepo.save).toHaveBeenCalled();
      const members = sectionMemberRepo.save.mock.calls[0][0];
      expect(members.length).toBeGreaterThanOrEqual(9);
    });
  });

  // ──── Helper: setup mocks for full seed ────

  function setupSeedMocks() {
    userRepo.findOne.mockImplementation(({ where }: any) => {
      if (where?.email === 'admin@stankoff.ru') {
        return Promise.resolve({ id: 'admin-id', email: 'admin@stankoff.ru', role: UserRole.ADMIN });
      }
      return Promise.resolve(null);
    });

    let wsCounter = 0;
    workspaceRepo.save.mockImplementation((data: any) => {
      wsCounter++;
      return Promise.resolve({ id: `ws-${wsCounter}`, ...data });
    });

    let secCounter = 0;
    sectionRepo.save.mockImplementation((data: any) => {
      secCounter++;
      return Promise.resolve({ id: `sec-${secCounter}`, ...data });
    });

    let userCounter = 0;
    userRepo.save.mockImplementation((data: any) => {
      userCounter++;
      return Promise.resolve({ id: `user-${userCounter}`, ...data });
    });

    processDefRepo.save.mockImplementation((data: any) => {
      if (Array.isArray(data)) {
        return Promise.resolve(data.map((d, i) => ({ id: `pd-${i}`, ...d })));
      }
      return Promise.resolve({ id: 'pd-0', ...data });
    });

    slaDefRepo.save.mockImplementation((data: any) => {
      if (Array.isArray(data)) {
        return Promise.resolve(data.map((d, i) => ({ id: `sla-${i}`, ...d })));
      }
      return Promise.resolve({ id: 'sla-0', ...data });
    });

    let entityCounter = 0;
    entityRepo.save.mockImplementation((data: any) => {
      if (Array.isArray(data)) {
        return Promise.resolve(data.map((item: any) => {
          entityCounter++;
          return { id: `ent-${entityCounter}`, ...item, createdAt: item.createdAt || new Date() };
        }));
      }
      entityCounter++;
      return Promise.resolve({ id: `ent-${entityCounter}`, ...data, createdAt: data.createdAt || new Date() });
    });

    userGroupRepo.create.mockImplementation((data: any) => ({
      ...data,
      members: [],
    }));
    userGroupRepo.save.mockImplementation((data: any) => Promise.resolve({ id: 'ug-0', ...data }));
  }
});
