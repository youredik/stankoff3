import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { BpmnService } from './bpmn.service';
import { ProcessDefinition } from './entities/process-definition.entity';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from './entities/process-instance.entity';
import { BpmnWorkersService } from './bpmn-workers.service';
import { ConnectorsService } from '../connectors/connectors.service';

describe('BpmnService', () => {
  let service: BpmnService;
  let processDefinitionRepo: jest.Mocked<Repository<ProcessDefinition>>;
  let processInstanceRepo: jest.Mocked<Repository<ProcessInstance>>;

  const mockDefinition = {
    id: 'def-1',
    workspaceId: 'ws-1',
    name: 'Test Process',
    description: 'Test description',
    processId: 'test-process',
    bpmnXml: '<bpmn></bpmn>',
    version: 1,
    deployedKey: undefined,
    deployedAt: undefined,
    isDefault: false,
    isActive: true,
    createdById: 'user-1',
    createdBy: undefined,
    workspace: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ProcessDefinition;

  const mockInstance = {
    id: 'inst-1',
    workspaceId: 'ws-1',
    entityId: 'entity-1',
    processDefinitionId: 'def-1',
    processDefinition: mockDefinition,
    processDefinitionKey: 'key-123',
    processInstanceKey: 'instance-456',
    businessKey: 'entity-1',
    variables: {},
    status: ProcessInstanceStatus.ACTIVE,
    startedAt: new Date(),
    completedAt: undefined,
    startedById: 'user-1',
    startedBy: undefined,
    workspace: undefined,
    entity: undefined,
    updatedAt: new Date(),
  } as unknown as ProcessInstance;

  beforeEach(async () => {
    const mockProcessDefinitionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockProcessInstanceRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockWorkersService = {
      setZeebeClient: jest.fn(),
    };

    const mockConnectorsService = {
      setZeebeClient: jest.fn(),
      executeConnector: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BpmnService,
        {
          provide: getRepositoryToken(ProcessDefinition),
          useValue: mockProcessDefinitionRepo,
        },
        {
          provide: getRepositoryToken(ProcessInstance),
          useValue: mockProcessInstanceRepo,
        },
        {
          provide: BpmnWorkersService,
          useValue: mockWorkersService,
        },
        {
          provide: ConnectorsService,
          useValue: mockConnectorsService,
        },
      ],
    }).compile();

    service = module.get<BpmnService>(BpmnService);
    processDefinitionRepo = module.get(getRepositoryToken(ProcessDefinition));
    processInstanceRepo = module.get(getRepositoryToken(ProcessInstance));

    // Prevent actual connection attempt in tests
    jest.spyOn(service as any, 'connect').mockResolvedValue(undefined);
  });

  describe('getHealth', () => {
    it('должен вернуть connected: false когда Zeebe не подключен', async () => {
      const health = await service.getHealth();

      expect(health).toEqual({ connected: false });
    });
  });

  describe('findAllDefinitions', () => {
    it('должен вернуть список определений для workspace', async () => {
      processDefinitionRepo.find.mockResolvedValue([mockDefinition]);

      const result = await service.findAllDefinitions('ws-1');

      expect(result).toEqual([mockDefinition]);
      expect(processDefinitionRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { createdAt: 'DESC' },
        relations: ['createdBy'],
      });
    });

    it('должен вернуть пустой массив если нет определений', async () => {
      processDefinitionRepo.find.mockResolvedValue([]);

      const result = await service.findAllDefinitions('ws-empty');

      expect(result).toEqual([]);
    });
  });

  describe('findDefinition', () => {
    it('должен вернуть определение по ID', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(mockDefinition);

      const result = await service.findDefinition('def-1');

      expect(result).toEqual(mockDefinition);
      expect(processDefinitionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'def-1' },
        relations: ['createdBy'],
      });
    });

    it('должен выбросить NotFoundException если определение не найдено', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(null);

      await expect(service.findDefinition('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createDefinition', () => {
    it('должен создать новое определение', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(null);
      processDefinitionRepo.create.mockReturnValue(mockDefinition);
      processDefinitionRepo.save.mockResolvedValue(mockDefinition);

      const result = await service.createDefinition('ws-1', {
        name: 'Test Process',
        description: 'Test description',
        processId: 'test-process',
        bpmnXml: '<bpmn></bpmn>',
      });

      expect(result).toEqual(mockDefinition);
      expect(processDefinitionRepo.create).toHaveBeenCalled();
      expect(processDefinitionRepo.save).toHaveBeenCalled();
    });

    it('должен обновить существующее определение с тем же processId', async () => {
      const existingDef = { ...mockDefinition };
      processDefinitionRepo.findOne.mockResolvedValue(existingDef);
      processDefinitionRepo.save.mockResolvedValue({
        ...existingDef,
        name: 'Updated Name',
      });

      const result = await service.createDefinition('ws-1', {
        name: 'Updated Name',
        processId: 'test-process',
        bpmnXml: '<bpmn>updated</bpmn>',
      });

      expect(result.name).toBe('Updated Name');
      expect(processDefinitionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteDefinition', () => {
    it('должен удалить определение без активных экземпляров', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(mockDefinition);
      processInstanceRepo.count.mockResolvedValue(0);
      processDefinitionRepo.remove.mockResolvedValue(mockDefinition);

      await service.deleteDefinition('def-1');

      expect(processDefinitionRepo.remove).toHaveBeenCalledWith(mockDefinition);
    });

    it('должен выбросить ошибку если есть активные экземпляры', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(mockDefinition);
      processInstanceRepo.count.mockResolvedValue(3);

      await expect(service.deleteDefinition('def-1')).rejects.toThrow(
        'Cannot delete process definition with 3 active instance(s)',
      );
    });

    it('должен выбросить NotFoundException если определение не найдено', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteDefinition('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findInstancesByEntity', () => {
    it('должен вернуть экземпляры для entity', async () => {
      processInstanceRepo.find.mockResolvedValue([mockInstance]);

      const result = await service.findInstancesByEntity('entity-1');

      expect(result).toEqual([mockInstance]);
      expect(processInstanceRepo.find).toHaveBeenCalledWith({
        where: { entityId: 'entity-1' },
        order: { startedAt: 'DESC' },
        relations: ['processDefinition'],
      });
    });
  });

  describe('findInstancesByWorkspace', () => {
    it('должен вернуть экземпляры для workspace', async () => {
      processInstanceRepo.find.mockResolvedValue([mockInstance]);

      const result = await service.findInstancesByWorkspace('ws-1');

      expect(result).toEqual([mockInstance]);
      expect(processInstanceRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { startedAt: 'DESC' },
        relations: ['processDefinition'],
        take: 100,
      });
    });
  });

  describe('updateInstanceStatus', () => {
    it('должен обновить статус экземпляра на COMPLETED', async () => {
      processInstanceRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.updateInstanceStatus(
        'instance-456',
        ProcessInstanceStatus.COMPLETED,
      );

      expect(processInstanceRepo.update).toHaveBeenCalledWith(
        { processInstanceKey: 'instance-456' },
        expect.objectContaining({
          status: ProcessInstanceStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      );
    });

    it('должен обновить статус экземпляра на ACTIVE без completedAt', async () => {
      processInstanceRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.updateInstanceStatus(
        'instance-456',
        ProcessInstanceStatus.ACTIVE,
      );

      expect(processInstanceRepo.update).toHaveBeenCalledWith(
        { processInstanceKey: 'instance-456' },
        expect.objectContaining({
          status: ProcessInstanceStatus.ACTIVE,
          completedAt: undefined,
        }),
      );
    });
  });

  describe('getDefinitionStatistics', () => {
    it('должен вернуть статистику по определению', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(mockDefinition);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'active', count: '5', avgDuration: null },
          { status: 'completed', count: '10', avgDuration: '3600000' },
          { status: 'terminated', count: '2', avgDuration: null },
        ]),
      };

      processInstanceRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getDefinitionStatistics('def-1');

      expect(result).toEqual({
        total: 17,
        active: 5,
        completed: 10,
        terminated: 2,
        incident: 0,
        avgDurationMs: 3600000,
      });
    });
  });

  describe('getWorkspaceStatistics', () => {
    it('должен вернуть статистику по workspace', async () => {
      processDefinitionRepo.count.mockResolvedValue(5);

      const defQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(3),
      };
      processDefinitionRepo.createQueryBuilder.mockReturnValue(
        defQueryBuilder as any,
      );

      const instQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'active', count: '10' },
          { status: 'completed', count: '25' },
        ]),
      };
      processInstanceRepo.createQueryBuilder.mockReturnValue(
        instQueryBuilder as any,
      );

      const result = await service.getWorkspaceStatistics('ws-1');

      expect(result).toEqual({
        definitions: 5,
        deployedDefinitions: 3,
        totalInstances: 35,
        activeInstances: 10,
        completedInstances: 25,
      });
    });
  });

  describe('Zeebe operations (requires connection)', () => {
    it('deployDefinition должен выбросить ошибку если Zeebe не подключен', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(mockDefinition);

      await expect(service.deployDefinition('def-1')).rejects.toThrow(
        'Zeebe is not connected. Cannot deploy process.',
      );
    });

    it('startProcess должен выбросить ошибку если процесс не развёрнут', async () => {
      processDefinitionRepo.findOne.mockResolvedValue(mockDefinition);

      await expect(service.startProcess('def-1', {})).rejects.toThrow(
        'Process definition is not deployed. Deploy it first before starting instances.',
      );
    });

    it('startProcess должен выбросить ошибку если Zeebe не подключен', async () => {
      const deployedDef = { ...mockDefinition, deployedKey: 'key-123' };
      processDefinitionRepo.findOne.mockResolvedValue(deployedDef);

      await expect(service.startProcess('def-1', {})).rejects.toThrow(
        'Zeebe is not connected. Cannot start process.',
      );
    });

    it('cancelInstance должен выбросить ошибку если Zeebe не подключен', async () => {
      await expect(service.cancelInstance('instance-456')).rejects.toThrow(
        'Zeebe is not connected. Cannot cancel instance.',
      );
    });

    it('sendMessage должен выбросить ошибку если Zeebe не подключен', async () => {
      await expect(
        service.sendMessage('test-message', 'correlation-key'),
      ).rejects.toThrow('Zeebe is not connected. Cannot send message.');
    });
  });
});
