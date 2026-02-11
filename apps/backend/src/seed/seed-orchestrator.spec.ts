import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from '../modules/section/section.entity';
import { BpmnService } from '../modules/bpmn/bpmn.service';
import { SeedOrchestratorService } from './seed-orchestrator.service';
import { SeedCleanupService } from './seed-cleanup.service';
import { SeedUsersService } from './seed-users.service';
import { SeedKeycloakService } from './seed-keycloak.service';
import { SeedStructureService } from './seed-structure.service';
import { SeedEntitiesService } from './seed-entities.service';
import { SeedItDepartmentService } from './seed-it-department.service';
import { SeedBpmnService } from './seed-bpmn.service';
import { SeedRbacService } from './seed-rbac.service';
import { SeedSlaDmnService } from './seed-sla-dmn.service';
import { Workspace } from '../modules/workspace/workspace.entity';

describe('SeedOrchestratorService', () => {
  let service: SeedOrchestratorService;
  let sectionRepo: jest.Mocked<Repository<Section>>;
  let bpmnService: jest.Mocked<BpmnService>;
  let cleanup: jest.Mocked<SeedCleanupService>;
  let seedUsers: jest.Mocked<SeedUsersService>;
  let seedKeycloak: jest.Mocked<SeedKeycloakService>;
  let seedStructure: jest.Mocked<SeedStructureService>;
  let seedEntities: jest.Mocked<SeedEntitiesService>;
  let seedItDept: jest.Mocked<SeedItDepartmentService>;
  let seedRbac: jest.Mocked<SeedRbacService>;
  let seedBpmn: jest.Mocked<SeedBpmnService>;
  let seedSlaDmn: jest.Mocked<SeedSlaDmnService>;

  const originalEnv = process.env;

  const mockUsers = [{ id: '1', email: 'youredik@gmail.com' }] as any[];

  const mockItSection = { id: 'it-section', name: 'IT' } as Section;

  const mockSections = [
    { id: '1', name: 'IT' } as Section,
    { id: '2', name: 'Продажи' } as Section,
  ];

  const mockWorkspaces = {
    zk: { id: 'zk' } as Workspace,
    kp: { id: 'kp' } as Workspace,
    sz: { id: 'sz' } as Workspace,
    rek: { id: 'rek' } as Workspace,
    mk: { id: 'mk' } as Workspace,
    kn: { id: 'kn' } as Workspace,
    sk: { id: 'sk' } as Workspace,
    dv: { id: 'dv' } as Workspace,
    fd: { id: 'fd' } as Workspace,
    sr: { id: 'sr' } as Workspace,
    dg: { id: 'dg' } as Workspace,
    ved: { id: 'ved' } as Workspace,
    hr: { id: 'hr' } as Workspace,
    tn: { id: 'tn' } as Workspace,
  };

  const mockItWorkspace = { id: 'it-ws' } as Workspace;

  const mockEntities = {
    zk: [{ id: 'e1' }, { id: 'e2' }],
    kp: [{ id: 'e3' }],
  } as any;

  const mockItEntities = [{ id: 'it-e1' }] as any[];

  beforeEach(async () => {
    // Устанавливаем env для разрешения seed в тестах
    process.env = { ...originalEnv, NODE_ENV: 'development', ENABLE_SEED: 'true' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedOrchestratorService,
        {
          provide: getRepositoryToken(Section),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: BpmnService,
          useValue: {
            waitForConnection: jest.fn(),
          },
        },
        {
          provide: SeedCleanupService,
          useValue: { cleanupAll: jest.fn() },
        },
        {
          provide: SeedUsersService,
          useValue: { createAll: jest.fn() },
        },
        {
          provide: SeedRbacService,
          useValue: { seedRolesAndGlobal: jest.fn(), seedMembershipRoles: jest.fn() },
        },
        {
          provide: SeedKeycloakService,
          useValue: { syncUsers: jest.fn() },
        },
        {
          provide: SeedStructureService,
          useValue: { createAll: jest.fn() },
        },
        {
          provide: SeedEntitiesService,
          useValue: { createAll: jest.fn() },
        },
        {
          provide: SeedItDepartmentService,
          useValue: { createAll: jest.fn() },
        },
        {
          provide: SeedBpmnService,
          useValue: { createAll: jest.fn() },
        },
        {
          provide: SeedSlaDmnService,
          useValue: { createAll: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SeedOrchestratorService);
    sectionRepo = module.get(getRepositoryToken(Section));
    bpmnService = module.get(BpmnService);
    cleanup = module.get(SeedCleanupService);
    seedUsers = module.get(SeedUsersService);
    seedRbac = module.get(SeedRbacService);
    seedKeycloak = module.get(SeedKeycloakService);
    seedStructure = module.get(SeedStructureService);
    seedEntities = module.get(SeedEntitiesService);
    seedItDept = module.get(SeedItDepartmentService);
    seedBpmn = module.get(SeedBpmnService);
    seedSlaDmn = module.get(SeedSlaDmnService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('onModuleInit', () => {
    it('должен пропустить seed в production окружении', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_SEED = undefined;

      await service.onModuleInit();

      expect(sectionRepo.findOne).not.toHaveBeenCalled();
      expect(cleanup.cleanupAll).not.toHaveBeenCalled();
    });

    it('должен пропустить seed если ENABLE_SEED не установлен', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ENABLE_SEED;

      await service.onModuleInit();

      expect(sectionRepo.findOne).not.toHaveBeenCalled();
      expect(cleanup.cleanupAll).not.toHaveBeenCalled();
    });

    it('должен пропустить seed, если секция "Продажи" уже существует', async () => {
      sectionRepo.findOne.mockResolvedValue({ id: '1', name: 'Продажи' } as Section);

      await service.onModuleInit();

      expect(sectionRepo.findOne).toHaveBeenCalledWith({ where: { name: 'Продажи' } });
      expect(cleanup.cleanupAll).not.toHaveBeenCalled();
      expect(seedUsers.createAll).not.toHaveBeenCalled();
    });

    it('должен вызвать сервисы в правильном порядке: cleanup -> users -> keycloak -> structure -> entities -> IT -> bpmn -> sla/dmn', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      bpmnService.waitForConnection.mockResolvedValue(undefined);
      seedUsers.createAll.mockResolvedValue(mockUsers);
      seedKeycloak.syncUsers.mockResolvedValue(undefined);
      seedStructure.createAll.mockResolvedValue({
        sections: mockSections,
        workspaces: mockWorkspaces,
      } as any);
      seedEntities.createAll.mockResolvedValue(mockEntities);
      seedItDept.createAll.mockResolvedValue({
        workspace: mockItWorkspace,
        entities: mockItEntities,
      } as any);
      seedBpmn.createAll.mockResolvedValue(undefined);
      seedSlaDmn.createAll.mockResolvedValue(undefined);

      const callOrder: string[] = [];
      cleanup.cleanupAll.mockImplementation(async () => { callOrder.push('cleanup'); });
      seedUsers.createAll.mockImplementation(async () => { callOrder.push('users'); return mockUsers; });
      seedRbac.seedRolesAndGlobal.mockImplementation(async () => { callOrder.push('rbac-global'); });
      seedKeycloak.syncUsers.mockImplementation(async () => { callOrder.push('keycloak'); });
      seedStructure.createAll.mockImplementation(async () => {
        callOrder.push('structure');
        return { sections: mockSections, workspaces: mockWorkspaces } as any;
      });
      seedRbac.seedMembershipRoles.mockImplementation(async () => { callOrder.push('rbac-membership'); });
      seedEntities.createAll.mockImplementation(async () => { callOrder.push('entities'); return mockEntities; });
      seedItDept.createAll.mockImplementation(async () => {
        callOrder.push('itDept');
        return { workspace: mockItWorkspace, entities: mockItEntities } as any;
      });
      seedBpmn.createAll.mockImplementation(async () => { callOrder.push('bpmn'); });
      seedSlaDmn.createAll.mockImplementation(async () => { callOrder.push('slaDmn'); });

      await service.onModuleInit();

      expect(callOrder).toEqual([
        'cleanup',
        'users',
        'rbac-global',
        'keycloak',
        'structure',
        'rbac-membership',
        'entities',
        'itDept',
        'bpmn',
        'slaDmn',
      ]);
    });

    it('должен корректно обработать недоступность Zeebe и пропустить BPMN seed', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      bpmnService.waitForConnection.mockRejectedValue(new Error('Zeebe timeout'));
      seedUsers.createAll.mockResolvedValue(mockUsers);
      seedKeycloak.syncUsers.mockResolvedValue(undefined);
      seedStructure.createAll.mockResolvedValue({
        sections: mockSections,
        workspaces: mockWorkspaces,
      } as any);
      seedEntities.createAll.mockResolvedValue(mockEntities);
      seedItDept.createAll.mockResolvedValue({
        workspace: mockItWorkspace,
        entities: mockItEntities,
      } as any);
      seedSlaDmn.createAll.mockResolvedValue(undefined);

      await service.onModuleInit();

      // BPMN seed не должен вызываться при недоступном Zeebe
      expect(seedBpmn.createAll).not.toHaveBeenCalled();

      // Остальные сервисы должны быть вызваны
      expect(cleanup.cleanupAll).toHaveBeenCalled();
      expect(seedUsers.createAll).toHaveBeenCalled();
      expect(seedKeycloak.syncUsers).toHaveBeenCalled();
      expect(seedStructure.createAll).toHaveBeenCalled();
      expect(seedEntities.createAll).toHaveBeenCalled();
      expect(seedItDept.createAll).toHaveBeenCalled();
      expect(seedSlaDmn.createAll).toHaveBeenCalled();
    });

    it('должен перехватить ошибку BPMN seed, залогировать и продолжить', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      bpmnService.waitForConnection.mockResolvedValue(undefined);
      seedUsers.createAll.mockResolvedValue(mockUsers);
      seedKeycloak.syncUsers.mockResolvedValue(undefined);
      seedStructure.createAll.mockResolvedValue({
        sections: mockSections,
        workspaces: mockWorkspaces,
      } as any);
      seedEntities.createAll.mockResolvedValue(mockEntities);
      seedItDept.createAll.mockResolvedValue({
        workspace: mockItWorkspace,
        entities: mockItEntities,
      } as any);
      seedBpmn.createAll.mockRejectedValue(new Error('Deploy failed'));
      seedSlaDmn.createAll.mockResolvedValue(undefined);

      // Не должен выбросить исключение
      await expect(service.onModuleInit()).resolves.not.toThrow();

      // BPMN вызывался, но упал
      expect(seedBpmn.createAll).toHaveBeenCalled();

      // SLA/DMN всё равно должен был вызваться после ошибки BPMN
      expect(seedSlaDmn.createAll).toHaveBeenCalled();
    });

    it('должен перехватить ошибку SLA/DMN seed и не выбросить исключение', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      bpmnService.waitForConnection.mockResolvedValue(undefined);
      seedUsers.createAll.mockResolvedValue(mockUsers);
      seedKeycloak.syncUsers.mockResolvedValue(undefined);
      seedStructure.createAll.mockResolvedValue({
        sections: mockSections,
        workspaces: mockWorkspaces,
      } as any);
      seedEntities.createAll.mockResolvedValue(mockEntities);
      seedItDept.createAll.mockResolvedValue({
        workspace: mockItWorkspace,
        entities: mockItEntities,
      } as any);
      seedBpmn.createAll.mockResolvedValue(undefined);
      seedSlaDmn.createAll.mockRejectedValue(new Error('SLA creation failed'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(seedSlaDmn.createAll).toHaveBeenCalled();
    });

    it('должен передать корректные аргументы в seedBpmn.createAll', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      bpmnService.waitForConnection.mockResolvedValue(undefined);
      seedUsers.createAll.mockResolvedValue(mockUsers);
      seedKeycloak.syncUsers.mockResolvedValue(undefined);
      seedStructure.createAll.mockResolvedValue({
        sections: mockSections,
        workspaces: mockWorkspaces,
      } as any);
      seedEntities.createAll.mockResolvedValue(mockEntities);
      seedItDept.createAll.mockResolvedValue({
        workspace: mockItWorkspace,
        entities: mockItEntities,
      } as any);
      seedBpmn.createAll.mockResolvedValue(undefined);
      seedSlaDmn.createAll.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(seedBpmn.createAll).toHaveBeenCalledWith(
        mockWorkspaces,
        mockItWorkspace,
        mockUsers,
        mockEntities,
        mockItEntities,
      );
    });

    it('должен передать IT секцию в seedItDept.createAll', async () => {
      sectionRepo.findOne.mockResolvedValue(null);
      bpmnService.waitForConnection.mockResolvedValue(undefined);
      seedUsers.createAll.mockResolvedValue(mockUsers);
      seedKeycloak.syncUsers.mockResolvedValue(undefined);
      seedStructure.createAll.mockResolvedValue({
        sections: [mockItSection],
        workspaces: mockWorkspaces,
      } as any);
      seedEntities.createAll.mockResolvedValue(mockEntities);
      seedItDept.createAll.mockResolvedValue({
        workspace: mockItWorkspace,
        entities: mockItEntities,
      } as any);
      seedBpmn.createAll.mockResolvedValue(undefined);
      seedSlaDmn.createAll.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(seedItDept.createAll).toHaveBeenCalledWith(mockUsers, mockItSection);
    });
  });
});
