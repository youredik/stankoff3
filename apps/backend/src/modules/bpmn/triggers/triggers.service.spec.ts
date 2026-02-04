import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggersService } from './triggers.service';
import { CronTriggerScheduler } from './cron-trigger.scheduler';
import { BpmnService } from '../bpmn.service';
import {
  ProcessTrigger,
  TriggerType,
  TriggerExecution,
  TriggerExecutionStatus,
} from '../entities/process-trigger.entity';

describe('TriggersService', () => {
  let service: TriggersService;
  let triggerRepository: jest.Mocked<Repository<ProcessTrigger>>;
  let executionRepository: jest.Mocked<Repository<TriggerExecution>>;
  let bpmnService: jest.Mocked<BpmnService>;
  let cronScheduler: jest.Mocked<CronTriggerScheduler>;

  const mockProcessDefinition = {
    id: 'def-1',
    workspaceId: 'ws-1',
    name: 'Test Process',
    processId: 'test-process',
    bpmnXml: '<bpmn>...</bpmn>',
    deployedKey: 'deployed-key-1',
    version: 1,
    isDefault: false,
    createdById: 'user-1',
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deployedAt: new Date(),
  };

  const mockTrigger: ProcessTrigger = {
    id: 'trigger-1',
    processDefinitionId: 'def-1',
    processDefinition: mockProcessDefinition as any,
    workspaceId: 'ws-1',
    workspace: null as any,
    triggerType: TriggerType.ENTITY_CREATED,
    conditions: {},
    variableMappings: {},
    isActive: true,
    lastTriggeredAt: null,
    triggerCount: 0,
    name: 'Test Trigger',
    description: null,
    createdById: 'user-1',
    createdBy: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    executions: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriggersService,
        {
          provide: getRepositoryToken(ProcessTrigger),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TriggerExecution),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: BpmnService,
          useValue: {
            findDefinition: jest.fn(),
            startProcess: jest.fn(),
          },
        },
        {
          provide: CronTriggerScheduler,
          useValue: {
            onTriggerChanged: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TriggersService>(TriggersService);
    triggerRepository = module.get(getRepositoryToken(ProcessTrigger));
    executionRepository = module.get(getRepositoryToken(TriggerExecution));
    bpmnService = module.get(BpmnService);
    cronScheduler = module.get(CronTriggerScheduler);
  });

  describe('create', () => {
    it('должен создавать триггер', async () => {
      const dto = {
        processDefinitionId: 'def-1',
        workspaceId: 'ws-1',
        triggerType: TriggerType.ENTITY_CREATED,
        conditions: {},
        variableMappings: {},
      };

      bpmnService.findDefinition.mockResolvedValue(mockTrigger.processDefinition);
      triggerRepository.create.mockReturnValue(mockTrigger);
      triggerRepository.save.mockResolvedValue(mockTrigger);

      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(mockTrigger);
      expect(bpmnService.findDefinition).toHaveBeenCalledWith('def-1');
      expect(triggerRepository.save).toHaveBeenCalled();
      expect(cronScheduler.onTriggerChanged).toHaveBeenCalledWith(mockTrigger);
    });
  });

  describe('findByWorkspace', () => {
    it('должен возвращать триггеры по workspace', async () => {
      triggerRepository.find.mockResolvedValue([mockTrigger]);

      const result = await service.findByWorkspace('ws-1');

      expect(result).toEqual([mockTrigger]);
      expect(triggerRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        relations: ['processDefinition', 'createdBy'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('должен возвращать триггер по ID', async () => {
      triggerRepository.findOne.mockResolvedValue(mockTrigger);

      const result = await service.findOne('trigger-1');

      expect(result).toEqual(mockTrigger);
    });

    it('должен выбрасывать NotFoundException если триггер не найден', async () => {
      triggerRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow('Trigger unknown not found');
    });
  });

  describe('toggle', () => {
    it('должен переключать состояние триггера', async () => {
      const activeTrigger = { ...mockTrigger, isActive: true };
      triggerRepository.findOne.mockResolvedValue(activeTrigger);
      triggerRepository.save.mockImplementation(async (t) => ({ ...t, isActive: false } as ProcessTrigger));

      const result = await service.toggle('trigger-1');

      expect(result.isActive).toBe(false);
      expect(cronScheduler.onTriggerChanged).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('должен удалять триггер', async () => {
      triggerRepository.findOne.mockResolvedValue(mockTrigger);
      triggerRepository.remove.mockResolvedValue(mockTrigger);

      await service.delete('trigger-1');

      expect(cronScheduler.onTriggerChanged).toHaveBeenCalledWith(mockTrigger, true);
      expect(triggerRepository.remove).toHaveBeenCalledWith(mockTrigger);
    });
  });

  describe('evaluateTriggers', () => {
    it('должен находить и запускать подходящие триггеры', async () => {
      const activeTrigger = {
        ...mockTrigger,
        conditions: { toStatus: 'in_progress' },
      };
      triggerRepository.find.mockResolvedValue([activeTrigger]);

      const processInstance = { id: 'instance-1' };
      bpmnService.startProcess.mockResolvedValue(processInstance as any);
      executionRepository.create.mockReturnValue({} as TriggerExecution);
      executionRepository.save.mockResolvedValue({} as TriggerExecution);
      triggerRepository.update.mockResolvedValue({} as any);

      await service.evaluateTriggers(
        TriggerType.STATUS_CHANGED,
        { oldStatus: 'new', newStatus: 'in_progress', entityId: 'entity-1' },
        'ws-1',
      );

      expect(bpmnService.startProcess).toHaveBeenCalledWith(
        'def-1',
        expect.any(Object),
        expect.objectContaining({ entityId: 'entity-1' }),
      );
    });

    it('не должен запускать триггер если условия не совпадают', async () => {
      const activeTrigger = {
        ...mockTrigger,
        conditions: { toStatus: 'completed' },
      };
      triggerRepository.find.mockResolvedValue([activeTrigger]);

      await service.evaluateTriggers(
        TriggerType.STATUS_CHANGED,
        { oldStatus: 'new', newStatus: 'in_progress' },
        'ws-1',
      );

      expect(bpmnService.startProcess).not.toHaveBeenCalled();
    });

    it('должен срабатывать при пустых условиях', async () => {
      const activeTrigger = { ...mockTrigger, conditions: {} };
      triggerRepository.find.mockResolvedValue([activeTrigger]);

      bpmnService.startProcess.mockResolvedValue({ id: 'instance-1' } as any);
      executionRepository.create.mockReturnValue({} as TriggerExecution);
      executionRepository.save.mockResolvedValue({} as TriggerExecution);
      triggerRepository.update.mockResolvedValue({} as any);

      await service.evaluateTriggers(
        TriggerType.ENTITY_CREATED,
        { entityId: 'entity-1', workspaceId: 'ws-1' },
        'ws-1',
      );

      expect(bpmnService.startProcess).toHaveBeenCalled();
    });
  });

  describe('evaluateConditions (через evaluateTriggers)', () => {
    it('должен проверять fromStatus', async () => {
      const trigger = {
        ...mockTrigger,
        conditions: { fromStatus: 'new' },
      };
      triggerRepository.find.mockResolvedValue([trigger]);

      // Условие совпадает
      bpmnService.startProcess.mockResolvedValue({ id: 'i1' } as any);
      executionRepository.create.mockReturnValue({} as TriggerExecution);
      executionRepository.save.mockResolvedValue({} as TriggerExecution);
      triggerRepository.update.mockResolvedValue({} as any);

      await service.evaluateTriggers(
        TriggerType.STATUS_CHANGED,
        { oldStatus: 'new', newStatus: 'in_progress' },
        'ws-1',
      );
      expect(bpmnService.startProcess).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Условие не совпадает
      triggerRepository.find.mockResolvedValue([trigger]);
      await service.evaluateTriggers(
        TriggerType.STATUS_CHANGED,
        { oldStatus: 'in_progress', newStatus: 'completed' },
        'ws-1',
      );
      expect(bpmnService.startProcess).not.toHaveBeenCalled();
    });

    it('должен проверять priority', async () => {
      const trigger = {
        ...mockTrigger,
        conditions: { priority: 'high' },
      };
      triggerRepository.find.mockResolvedValue([trigger]);

      // Приоритет совпадает
      bpmnService.startProcess.mockResolvedValue({ id: 'i1' } as any);
      executionRepository.create.mockReturnValue({} as TriggerExecution);
      executionRepository.save.mockResolvedValue({} as TriggerExecution);
      triggerRepository.update.mockResolvedValue({} as any);

      await service.evaluateTriggers(
        TriggerType.ENTITY_CREATED,
        { priority: 'high', entityId: 'e1' },
        'ws-1',
      );
      expect(bpmnService.startProcess).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Приоритет не совпадает
      triggerRepository.find.mockResolvedValue([trigger]);
      await service.evaluateTriggers(
        TriggerType.ENTITY_CREATED,
        { priority: 'low', entityId: 'e1' },
        'ws-1',
      );
      expect(bpmnService.startProcess).not.toHaveBeenCalled();
    });

    it('должен проверять onlyWhenAssigned', async () => {
      const trigger = {
        ...mockTrigger,
        triggerType: TriggerType.ASSIGNEE_CHANGED,
        conditions: { onlyWhenAssigned: true },
      };
      triggerRepository.find.mockResolvedValue([trigger]);

      // Новый исполнитель назначен
      bpmnService.startProcess.mockResolvedValue({ id: 'i1' } as any);
      executionRepository.create.mockReturnValue({} as TriggerExecution);
      executionRepository.save.mockResolvedValue({} as TriggerExecution);
      triggerRepository.update.mockResolvedValue({} as any);

      await service.evaluateTriggers(
        TriggerType.ASSIGNEE_CHANGED,
        { newAssigneeId: 'user-1' },
        'ws-1',
      );
      expect(bpmnService.startProcess).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Исполнитель снят
      triggerRepository.find.mockResolvedValue([trigger]);
      await service.evaluateTriggers(
        TriggerType.ASSIGNEE_CHANGED,
        { newAssigneeId: null },
        'ws-1',
      );
      expect(bpmnService.startProcess).not.toHaveBeenCalled();
    });
  });

  describe('getExecutions', () => {
    it('должен возвращать историю выполнения триггера', async () => {
      const executions: TriggerExecution[] = [
        {
          id: 'exec-1',
          triggerId: 'trigger-1',
          trigger: mockTrigger,
          processInstanceId: 'instance-1',
          triggerContext: {},
          status: TriggerExecutionStatus.SUCCESS,
          errorMessage: null,
          executedAt: new Date(),
        },
      ];
      executionRepository.find.mockResolvedValue(executions);

      const result = await service.getExecutions('trigger-1');

      expect(result).toEqual(executions);
      expect(executionRepository.find).toHaveBeenCalledWith({
        where: { triggerId: 'trigger-1' },
        order: { executedAt: 'DESC' },
        take: 50,
      });
    });
  });
});
