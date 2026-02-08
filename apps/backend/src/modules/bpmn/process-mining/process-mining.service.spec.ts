import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessMiningService } from './process-mining.service';
import { ProcessDefinition } from '../entities/process-definition.entity';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from '../entities/process-instance.entity';
import { ProcessActivityLog } from '../entities/process-activity-log.entity';
import { UserTask } from '../entities/user-task.entity';

describe('ProcessMiningService', () => {
  let service: ProcessMiningService;
  let instanceRepository: jest.Mocked<Repository<ProcessInstance>>;
  let definitionRepository: jest.Mocked<Repository<ProcessDefinition>>;
  let activityLogRepository: jest.Mocked<Repository<ProcessActivityLog>>;
  let userTaskRepository: jest.Mocked<Repository<UserTask>>;

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

  // Helper to create a mock query builder chain
  const createMockQueryBuilder = (rawResults: any[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue(rawResults),
    getQuery: jest.fn().mockReturnValue('SELECT pi.id FROM process_instances pi'),
    getParameters: jest.fn().mockReturnValue({}),
  });

  beforeEach(async () => {
    const mockDefinitionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const mockInstanceRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockActivityLogRepo = {
      createQueryBuilder: jest.fn(),
    };

    const mockUserTaskRepo = {
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
        {
          provide: getRepositoryToken(ProcessActivityLog),
          useValue: mockActivityLogRepo,
        },
        {
          provide: getRepositoryToken(UserTask),
          useValue: mockUserTaskRepo,
        },
      ],
    }).compile();

    service = module.get<ProcessMiningService>(ProcessMiningService);
    definitionRepository = module.get(getRepositoryToken(ProcessDefinition));
    instanceRepository = module.get(getRepositoryToken(ProcessInstance));
    activityLogRepository = module.get(getRepositoryToken(ProcessActivityLog));
    userTaskRepository = module.get(getRepositoryToken(UserTask));
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

    it('должен вернуть пустую статистику без запроса к БД если нет определений', async () => {
      definitionRepository.find.mockResolvedValue([]);

      const result = await service.getWorkspaceStats('ws-empty');

      expect(result.totalDefinitions).toBe(0);
      expect(result.totalInstances).toBe(0);
      expect(result.avgCompletionRate).toBe(0);
      expect(result.topProcessesByVolume).toEqual([]);
      expect(result.topProcessesByDuration).toEqual([]);
      expect(result.statusDistribution).toEqual([]);
      expect(instanceRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getElementStats', () => {
    it('должен вернуть статистику по элементам из activity logs и user tasks', async () => {
      const activityQb = createMockQueryBuilder([
        {
          elementId: 'Task_UpdateStatus',
          elementType: 'serviceTask',
          executionCount: 15,
          successCount: 13,
          failedCount: 2,
          avgDurationMs: 120,
          minDurationMs: 50,
          maxDurationMs: 350,
        },
        {
          elementId: 'Task_SendEmail',
          elementType: 'serviceTask',
          executionCount: 10,
          successCount: 10,
          failedCount: 0,
          avgDurationMs: 500,
          minDurationMs: 200,
          maxDurationMs: 1200,
        },
      ]);
      activityLogRepository.createQueryBuilder.mockReturnValue(activityQb as any);

      const instanceQb = createMockQueryBuilder();
      instanceRepository.createQueryBuilder.mockReturnValue(instanceQb as any);

      const userTaskQb = createMockQueryBuilder([
        {
          elementId: 'Task_ReviewRequest',
          elementType: 'userTask',
          executionCount: 8,
          successCount: 7,
          failedCount: 1,
          avgDurationMs: 300000,
          minDurationMs: 60000,
          maxDurationMs: 600000,
        },
      ]);
      userTaskRepository.createQueryBuilder.mockReturnValue(userTaskQb as any);

      const result = await service.getElementStats('def-1');

      expect(result.elements).toHaveLength(3);
      // Sorted by executionCount descending
      expect(result.elements[0].elementId).toBe('Task_UpdateStatus');
      expect(result.elements[0].executionCount).toBe(15);
      expect(result.elements[0].successCount).toBe(13);
      expect(result.elements[0].failedCount).toBe(2);
      expect(result.elements[0].avgDurationMs).toBe(120);

      expect(result.elements[1].elementId).toBe('Task_SendEmail');
      expect(result.elements[1].executionCount).toBe(10);

      expect(result.elements[2].elementId).toBe('Task_ReviewRequest');
      expect(result.elements[2].executionCount).toBe(8);
      expect(result.elements[2].elementType).toBe('userTask');
    });

    it('должен объединить данные при совпадении elementId из activity logs и user tasks', async () => {
      // Same elementId from both sources (edge case — element logged by both)
      const activityQb = createMockQueryBuilder([
        {
          elementId: 'Task_Shared',
          elementType: 'serviceTask',
          executionCount: 5,
          successCount: 5,
          failedCount: 0,
          avgDurationMs: 100,
          minDurationMs: 50,
          maxDurationMs: 200,
        },
      ]);
      activityLogRepository.createQueryBuilder.mockReturnValue(activityQb as any);

      const instanceQb = createMockQueryBuilder();
      instanceRepository.createQueryBuilder.mockReturnValue(instanceQb as any);

      const userTaskQb = createMockQueryBuilder([
        {
          elementId: 'Task_Shared',
          elementType: 'userTask',
          executionCount: 3,
          successCount: 2,
          failedCount: 1,
          avgDurationMs: 200,
          minDurationMs: 100,
          maxDurationMs: 500,
        },
      ]);
      userTaskRepository.createQueryBuilder.mockReturnValue(userTaskQb as any);

      const result = await service.getElementStats('def-1');

      expect(result.elements).toHaveLength(1);
      const merged = result.elements[0];
      expect(merged.elementId).toBe('Task_Shared');
      // Total count = 5 + 3
      expect(merged.executionCount).toBe(8);
      expect(merged.successCount).toBe(7);
      expect(merged.failedCount).toBe(1);
      // Weighted average: (100*5 + 200*3) / 8 = 1100/8 = 137.5 → 138 (rounded)
      expect(merged.avgDurationMs).toBe(138);
    });

    it('должен вернуть пустой массив без данных', async () => {
      const activityQb = createMockQueryBuilder([]);
      activityLogRepository.createQueryBuilder.mockReturnValue(activityQb as any);

      const instanceQb = createMockQueryBuilder();
      instanceRepository.createQueryBuilder.mockReturnValue(instanceQb as any);

      const userTaskQb = createMockQueryBuilder([]);
      userTaskRepository.createQueryBuilder.mockReturnValue(userTaskQb as any);

      const result = await service.getElementStats('def-1');

      expect(result.elements).toEqual([]);
    });

    it('должен применять фильтр по дате', async () => {
      const activityQb = createMockQueryBuilder([]);
      activityLogRepository.createQueryBuilder.mockReturnValue(activityQb as any);

      const instanceQb = createMockQueryBuilder();
      instanceRepository.createQueryBuilder.mockReturnValue(instanceQb as any);

      const userTaskQb = createMockQueryBuilder([]);
      userTaskRepository.createQueryBuilder.mockReturnValue(userTaskQb as any);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await service.getElementStats('def-1', startDate, endDate);

      // Verify date filters were applied to activity log query
      expect(activityQb.andWhere).toHaveBeenCalledWith(
        'log.startedAt >= :startDate',
        { startDate },
      );
      expect(activityQb.andWhere).toHaveBeenCalledWith(
        'log.startedAt <= :endDate',
        { endDate },
      );

      // Verify date filters were applied to instance subquery
      expect(instanceQb.andWhere).toHaveBeenCalledWith(
        'pi.startedAt >= :startDate',
        { startDate },
      );
      expect(instanceQb.andWhere).toHaveBeenCalledWith(
        'pi.startedAt <= :endDate',
        { endDate },
      );
    });

    it('должен корректно обработать null в avgDurationMs', async () => {
      const activityQb = createMockQueryBuilder([
        {
          elementId: 'StartEvent_1',
          elementType: 'startEvent',
          executionCount: 20,
          successCount: 20,
          failedCount: 0,
          avgDurationMs: null,
          minDurationMs: null,
          maxDurationMs: null,
        },
      ]);
      activityLogRepository.createQueryBuilder.mockReturnValue(activityQb as any);

      const instanceQb = createMockQueryBuilder();
      instanceRepository.createQueryBuilder.mockReturnValue(instanceQb as any);

      const userTaskQb = createMockQueryBuilder([]);
      userTaskRepository.createQueryBuilder.mockReturnValue(userTaskQb as any);

      const result = await service.getElementStats('def-1');

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].avgDurationMs).toBeNull();
      expect(result.elements[0].minDurationMs).toBeNull();
      expect(result.elements[0].maxDurationMs).toBeNull();
      expect(result.elements[0].executionCount).toBe(20);
    });
  });
});
