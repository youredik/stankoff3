import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessMiningService } from './process-mining.service';
import { ProcessDefinition } from '../entities/process-definition.entity';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from '../entities/process-instance.entity';

describe('ProcessMiningService', () => {
  let service: ProcessMiningService;
  let instanceRepository: jest.Mocked<Repository<ProcessInstance>>;
  let definitionRepository: jest.Mocked<Repository<ProcessDefinition>>;

  const mockDefinition = {
    id: 'def-1',
    workspaceId: 'ws-1',
    name: 'Test Process',
    processId: 'test-process',
    bpmnXml: '<bpmn></bpmn>',
    version: 1,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  } as ProcessDefinition;

  const createMockInstance = (
    id: string,
    status: ProcessInstanceStatus,
    startedAt: Date,
    completedAt?: Date,
  ): ProcessInstance => ({
    id,
    processDefinitionId: 'def-1',
    processDefinition: mockDefinition,
    workspaceId: 'ws-1',
    processDefinitionKey: 'key-1',
    processInstanceKey: `instance-${id}`,
    businessKey: null,
    variables: {},
    status,
    startedAt,
    completedAt: completedAt || null,
    startedById: 'user-1',
    startedBy: null,
    workspace: null,
    entity: null,
    entityId: null,
    updatedAt: new Date(),
  } as unknown as ProcessInstance);

  beforeEach(async () => {
    const mockDefinitionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const mockInstanceRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessMiningService,
        {
          provide: getRepositoryToken(ProcessDefinition),
          useValue: mockDefinitionRepo,
        },
        {
          provide: getRepositoryToken(ProcessInstance),
          useValue: mockInstanceRepo,
        },
      ],
    }).compile();

    service = module.get<ProcessMiningService>(ProcessMiningService);
    definitionRepository = module.get(getRepositoryToken(ProcessDefinition));
    instanceRepository = module.get(getRepositoryToken(ProcessInstance));
  });

  describe('getProcessStats', () => {
    it('должен вернуть статистику для процесса с экземплярами', async () => {
      definitionRepository.findOne.mockResolvedValue(mockDefinition);

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const instances = [
        createMockInstance('1', ProcessInstanceStatus.COMPLETED, twoHoursAgo, oneHourAgo),
        createMockInstance('2', ProcessInstanceStatus.COMPLETED, oneHourAgo, now),
        createMockInstance('3', ProcessInstanceStatus.ACTIVE, now),
        createMockInstance('4', ProcessInstanceStatus.TERMINATED, oneHourAgo),
      ];

      instanceRepository.find.mockResolvedValue(instances);

      const result = await service.getProcessStats('def-1');

      expect(result.definitionId).toBe('def-1');
      expect(result.definitionName).toBe('Test Process');
      expect(result.totalInstances).toBe(4);
      expect(result.completedInstances).toBe(2);
      expect(result.activeInstances).toBe(1);
      expect(result.terminatedInstances).toBe(1);
      expect(result.completionRate).toBe(50);
      expect(result.avgDurationMinutes).not.toBeNull();
    });

    it('должен вернуть нулевую статистику для процесса без экземпляров', async () => {
      definitionRepository.findOne.mockResolvedValue(mockDefinition);
      instanceRepository.find.mockResolvedValue([]);

      const result = await service.getProcessStats('def-1');

      expect(result.totalInstances).toBe(0);
      expect(result.completedInstances).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.avgDurationMinutes).toBeNull();
    });

    it('должен выбросить ошибку если определение не найдено', async () => {
      definitionRepository.findOne.mockResolvedValue(null);

      await expect(service.getProcessStats('non-existent')).rejects.toThrow(
        'Process definition non-existent not found',
      );
    });
  });

  describe('getTimeAnalysis', () => {
    it('должен вернуть анализ по времени', async () => {
      const now = new Date();
      const instances = [
        createMockInstance('1', ProcessInstanceStatus.COMPLETED, now, now),
        createMockInstance('2', ProcessInstanceStatus.COMPLETED, now, now),
      ];

      instanceRepository.find.mockResolvedValue(instances);

      const result = await service.getTimeAnalysis('def-1');

      expect(result.dayOfWeekStats).toHaveLength(7);
      expect(result.hourlyStats).toHaveLength(24);
      expect(result.trendLine).toBeDefined();
    });
  });

  describe('getWorkspaceStats', () => {
    it('должен вернуть статистику по workspace', async () => {
      definitionRepository.find.mockResolvedValue([mockDefinition]);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          createMockInstance(
            '1',
            ProcessInstanceStatus.COMPLETED,
            new Date(),
            new Date(),
          ),
        ]),
      };
      instanceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<Repository<ProcessInstance>['createQueryBuilder']>,
      );

      const result = await service.getWorkspaceStats('ws-1');

      expect(result.totalDefinitions).toBe(1);
      expect(result.totalInstances).toBe(1);
      expect(result.statusDistribution).toBeDefined();
    });

    it('должен вернуть пустую статистику если нет определений', async () => {
      definitionRepository.find.mockResolvedValue([]);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      instanceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<Repository<ProcessInstance>['createQueryBuilder']>,
      );

      const result = await service.getWorkspaceStats('ws-empty');

      expect(result.totalDefinitions).toBe(0);
      expect(result.totalInstances).toBe(0);
      expect(result.avgCompletionRate).toBe(0);
    });
  });
});
