import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SeedServiceDepartment } from './seed-service-department';
import { User, UserRole } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Comment } from './modules/entity/comment.entity';
import { Workspace } from './modules/workspace/workspace.entity';
import { WorkspaceMember } from './modules/workspace/workspace-member.entity';
import { Section } from './modules/section/section.entity';
import { SectionMember } from './modules/section/section-member.entity';
import { SlaDefinition } from './modules/sla/entities/sla-definition.entity';
import { SlaInstance } from './modules/sla/entities/sla-instance.entity';
import { SlaEvent } from './modules/sla/entities/sla-event.entity';
import { DecisionTable } from './modules/dmn/entities/decision-table.entity';
import { ProcessDefinition } from './modules/bpmn/entities/process-definition.entity';
import { ProcessTrigger } from './modules/bpmn/entities/process-trigger.entity';
import { AutomationRule } from './modules/automation/automation-rule.entity';
import { UserGroup } from './modules/bpmn/entities/user-group.entity';
import { FormDefinition } from './modules/bpmn/entities/form-definition.entity';
import { BpmnService } from './modules/bpmn/bpmn.service';

// Helper to create mock repository
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

describe('SeedServiceDepartment', () => {
  let service: SeedServiceDepartment;
  let userRepo: ReturnType<typeof createMockRepository>;
  let workspaceRepo: ReturnType<typeof createMockRepository>;
  let entityRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let sectionRepo: ReturnType<typeof createMockRepository>;
  let sectionMemberRepo: ReturnType<typeof createMockRepository>;
  let commentRepo: ReturnType<typeof createMockRepository>;
  let slaDefRepo: ReturnType<typeof createMockRepository>;
  let slaInstRepo: ReturnType<typeof createMockRepository>;
  let slaEventRepo: ReturnType<typeof createMockRepository>;
  let dmnTableRepo: ReturnType<typeof createMockRepository>;
  let processDefRepo: ReturnType<typeof createMockRepository>;
  let triggerRepo: ReturnType<typeof createMockRepository>;
  let automationRepo: ReturnType<typeof createMockRepository>;
  let userGroupRepo: ReturnType<typeof createMockRepository>;
  let formDefRepo: ReturnType<typeof createMockRepository>;
  let mockBpmnService: {
    waitForConnection: jest.Mock;
    deployDefinition: jest.Mock;
    startProcess: jest.Mock;
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
    slaEventRepo = createMockRepository();
    dmnTableRepo = createMockRepository();
    processDefRepo = createMockRepository();
    triggerRepo = createMockRepository();
    automationRepo = createMockRepository();
    userGroupRepo = createMockRepository();
    formDefRepo = createMockRepository();
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedServiceDepartment,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Workspace), useValue: workspaceRepo },
        { provide: getRepositoryToken(WorkspaceEntity), useValue: entityRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: memberRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(SectionMember), useValue: sectionMemberRepo },
        { provide: getRepositoryToken(Comment), useValue: commentRepo },
        { provide: getRepositoryToken(SlaDefinition), useValue: slaDefRepo },
        { provide: getRepositoryToken(SlaInstance), useValue: slaInstRepo },
        { provide: getRepositoryToken(SlaEvent), useValue: slaEventRepo },
        { provide: getRepositoryToken(DecisionTable), useValue: dmnTableRepo },
        { provide: getRepositoryToken(ProcessDefinition), useValue: processDefRepo },
        { provide: getRepositoryToken(ProcessTrigger), useValue: triggerRepo },
        { provide: getRepositoryToken(AutomationRule), useValue: automationRepo },
        { provide: getRepositoryToken(UserGroup), useValue: userGroupRepo },
        { provide: getRepositoryToken(FormDefinition), useValue: formDefRepo },
        { provide: BpmnService, useValue: mockBpmnService },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<SeedServiceDepartment>(SeedServiceDepartment);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should skip if section "Сервис" already exists', async () => {
      sectionRepo.findOne.mockResolvedValue({ id: 'existing', name: 'Сервис' });
      userRepo.count.mockResolvedValue(5);

      await service.onModuleInit();

      expect(userRepo.save).not.toHaveBeenCalled();
      expect(mockBpmnService.waitForConnection).not.toHaveBeenCalled();
    });

    it('should skip if no users exist (base seed not run yet)', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(0);

      await service.onModuleInit();

      expect(sectionRepo.save).not.toHaveBeenCalled();
      expect(mockBpmnService.waitForConnection).not.toHaveBeenCalled();
    });

    it('should wait for Zeebe connection before seed', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });

      await service.onModuleInit();

      expect(mockBpmnService.waitForConnection).toHaveBeenCalledWith(30000);
    });

    it('should fail if Zeebe is not connected', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4);
      mockBpmnService.waitForConnection.mockRejectedValue(
        new Error('Zeebe connection not established within 30000ms'),
      );

      await expect(service.onModuleInit()).rejects.toThrow('Zeebe connection not established');
      expect(sectionRepo.save).not.toHaveBeenCalled();
    });

    it('should run seed when conditions are met', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      userRepo.count.mockResolvedValue(4); // Base seed has users
      userRepo.findOne.mockResolvedValue({ id: 'admin-id', email: 'admin@stankoff.ru' });

      await service.onModuleInit();

      expect(sectionRepo.save).toHaveBeenCalled();
      expect(workspaceRepo.save).toHaveBeenCalled();
      expect(entityRepo.save).toHaveBeenCalled();
    });
  });

  describe('seed', () => {
    beforeEach(() => {
      // Setup: base seed exists
      userRepo.count.mockResolvedValue(4);
      userRepo.findOne.mockImplementation(({ where }: any) => {
        if (where?.email === 'admin@stankoff.ru') {
          return Promise.resolve({ id: 'admin-id', email: 'admin@stankoff.ru', role: UserRole.ADMIN });
        }
        return Promise.resolve(null);
      });

      // Mock workspace save to return proper IDs
      let wsCounter = 0;
      workspaceRepo.save.mockImplementation((data: any) => {
        wsCounter++;
        return Promise.resolve({ id: `ws-${wsCounter}`, ...data });
      });

      // Mock section save
      sectionRepo.save.mockImplementation((data: any) =>
        Promise.resolve({ id: 'section-id', ...data }),
      );

      // Mock user save to return proper IDs
      let userCounter = 0;
      userRepo.save.mockImplementation((data: any) => {
        userCounter++;
        return Promise.resolve({ id: `user-${userCounter}`, ...data });
      });

      // Mock process definition save
      processDefRepo.save.mockImplementation((data: any) => {
        if (Array.isArray(data)) {
          return Promise.resolve(data.map((d, i) => ({ id: `pd-${i}`, ...d })));
        }
        return Promise.resolve({ id: 'pd-0', ...data });
      });

      // Mock SLA definition save
      slaDefRepo.save.mockImplementation((data: any) => {
        if (Array.isArray(data)) {
          return Promise.resolve(data.map((d, i) => ({ id: `sla-${i}`, ...d })));
        }
        return Promise.resolve({ id: 'sla-0', ...data });
      });
    });

    it('should create 11 service department users', async () => {
      await service.seed();

      expect(userRepo.save).toHaveBeenCalledTimes(11);
    });

    it('should create section "Сервис"', async () => {
      await service.seed();

      expect(sectionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Сервис',
          icon: '🛠️',
        }),
      );
    });

    it('should create 2 workspaces (TP and REK)', async () => {
      await service.seed();

      expect(workspaceRepo.save).toHaveBeenCalledTimes(2);

      const calls = workspaceRepo.save.mock.calls;
      const wsNames = calls.map((c: any) => c[0].name);
      expect(wsNames).toContain('Техническая поддержка');
      expect(wsNames).toContain('Рекламации');
    });

    it('should create TP workspace with 9 statuses', async () => {
      await service.seed();

      const tpCall = workspaceRepo.save.mock.calls.find(
        (c: any) => c[0].prefix === 'TP',
      );
      expect(tpCall).toBeDefined();

      const tpData = tpCall![0];
      const statusField = tpData.sections[0].fields.find(
        (f: any) => f.id === 'status',
      );
      expect(statusField).toBeDefined();
      expect(statusField.options).toHaveLength(9);

      const statusIds = statusField.options.map((o: any) => o.id);
      expect(statusIds).toEqual([
        'new', 'classified', 'assigned', 'in_progress',
        'waiting_client', 'waiting_vendor', 'resolved', 'closed', 'reopened',
      ]);
    });

    it('should create REK workspace with 9 statuses', async () => {
      await service.seed();

      const rekCall = workspaceRepo.save.mock.calls.find(
        (c: any) => c[0].prefix === 'REK',
      );
      expect(rekCall).toBeDefined();

      const rekData = rekCall![0];
      const statusField = rekData.sections[0].fields.find(
        (f: any) => f.id === 'status',
      );
      expect(statusField).toBeDefined();
      expect(statusField.options).toHaveLength(9);

      const statusIds = statusField.options.map((o: any) => o.id);
      expect(statusIds).toEqual([
        'received', 'registered', 'investigation', 'root_cause_analysis',
        'decision', 'corrective_actions', 'client_notification', 'closed', 'rejected',
      ]);
    });

    it('should create SLA definitions for TP (4 priorities)', async () => {
      await service.seed();

      const slaCalls = slaDefRepo.save.mock.calls;
      expect(slaCalls.length).toBeGreaterThanOrEqual(2);

      const tpSlaDefs = slaCalls[0][0];
      expect(Array.isArray(tpSlaDefs)).toBe(true);
      expect(tpSlaDefs).toHaveLength(4);
    });

    it('should create SLA definitions for REK (3 severities)', async () => {
      await service.seed();

      const slaCalls = slaDefRepo.save.mock.calls;
      const rekSlaDefs = slaCalls[1][0];
      expect(Array.isArray(rekSlaDefs)).toBe(true);
      expect(rekSlaDefs).toHaveLength(3);
    });

    it('should create 2 DMN tables', async () => {
      await service.seed();

      expect(dmnTableRepo.save).toHaveBeenCalledTimes(2);

      const dmnNames = dmnTableRepo.save.mock.calls.map((c: any) => c[0].name);
      expect(dmnNames).toContain('Маршрутизация техподдержки');
      expect(dmnNames).toContain('Оценка серьёзности рекламации');
    });

    it('should create 3 process definitions', async () => {
      await service.seed();

      const pdCall = processDefRepo.save.mock.calls[0][0];
      expect(Array.isArray(pdCall)).toBe(true);
      expect(pdCall).toHaveLength(3);

      const processIds = pdCall.map((d: any) => d.processId);
      expect(processIds).toContain('service-support-v2');
      expect(processIds).toContain('claims-management');
      expect(processIds).toContain('sla-escalation');
    });

    it('should deploy 3 process definitions to Zeebe', async () => {
      await service.seed();

      expect(mockBpmnService.deployDefinition).toHaveBeenCalledTimes(3);
    });

    it('should create BPMN triggers for auto-starting processes', async () => {
      await service.seed();

      expect(triggerRepo.save).toHaveBeenCalled();
      const triggers = triggerRepo.save.mock.calls[0][0];
      expect(Array.isArray(triggers)).toBe(true);
      expect(triggers).toHaveLength(2);

      expect(triggers[0].triggerType).toBe('entity_created');
      expect(triggers[1].triggerType).toBe('entity_created');
    });

    it('should create automation rules', async () => {
      await service.seed();

      expect(automationRepo.save).toHaveBeenCalled();
      const rules = automationRepo.save.mock.calls[0][0];
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThanOrEqual(2);
    });

    it('should create 32 TP entities', async () => {
      await service.seed();

      const tpEntityCalls = entityRepo.save.mock.calls.filter(
        (c: any) => c[0].workspaceId === 'ws-1',
      );
      expect(tpEntityCalls).toHaveLength(32);
    });

    it('should create 12 REK entities', async () => {
      await service.seed();

      const rekEntityCalls = entityRepo.save.mock.calls.filter(
        (c: any) => c[0].workspaceId === 'ws-2',
      );
      expect(rekEntityCalls).toHaveLength(12);
    });

    it('should create comments for active entities', async () => {
      await service.seed();

      expect(commentRepo.save).toHaveBeenCalled();
    });

    it('should create workspace members', async () => {
      await service.seed();

      expect(memberRepo.save).toHaveBeenCalled();
      const members = memberRepo.save.mock.calls[0][0];
      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThanOrEqual(14);
    });

    it('should create 5 user groups', async () => {
      await service.seed();

      expect(userGroupRepo.create).toHaveBeenCalledTimes(5);
      expect(userGroupRepo.save).toHaveBeenCalledTimes(10);
    });

    it('should create SLA instances', async () => {
      await service.seed();

      expect(slaInstRepo.save).toHaveBeenCalled();
    });

    it('should start real Zeebe processes for TP and REK entities', async () => {
      await service.seed();

      // 32 TP + 12 REK = 44 processes
      expect(mockBpmnService.startProcess).toHaveBeenCalledTimes(44);
    });

    it('should pass correct variables when starting TP processes', async () => {
      await service.seed();

      const calls = mockBpmnService.startProcess.mock.calls;
      // First call should be TP entity
      const tpCall = calls[0];
      const [defId, variables, options] = tpCall;
      expect(defId).toBe('pd-0'); // supportV2 definition
      expect(variables.entityId).toBeDefined();
      expect(variables.title).toBeDefined();
      expect(options.startedById).toBeDefined();
    });
  });
});
