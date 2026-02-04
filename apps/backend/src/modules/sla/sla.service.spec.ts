import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { SlaService } from './sla.service';
import { SlaCalculatorService } from './sla-calculator.service';
import { SlaDefinition, SlaTargetType, BusinessHours } from './entities/sla-definition.entity';
import { SlaInstance, SlaStatus } from './entities/sla-instance.entity';
import { SlaEvent } from './entities/sla-event.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { EmailService } from '../email/email.service';
import { WorkspaceEntity } from '../entity/entity.entity';

describe('SlaService', () => {
  let service: SlaService;
  let definitionRepository: jest.Mocked<Repository<SlaDefinition>>;
  let instanceRepository: jest.Mocked<Repository<SlaInstance>>;
  let eventRepository: jest.Mocked<Repository<SlaEvent>>;
  let calculator: jest.Mocked<SlaCalculatorService>;

  const mockBusinessHours: BusinessHours = {
    start: '09:00',
    end: '18:00',
    timezone: 'Europe/Moscow',
    workdays: [1, 2, 3, 4, 5],
  };

  const mockDefinition: SlaDefinition = {
    id: 'def-1',
    workspaceId: 'ws-1',
    name: 'Test SLA',
    description: 'Test description',
    appliesTo: 'entity',
    conditions: { priority: 'high' },
    responseTime: 60,
    resolutionTime: 480,
    warningThreshold: 80,
    businessHoursOnly: true,
    businessHours: mockBusinessHours,
    escalationRules: [],
    isActive: true,
    priority: 10,
    createdById: 'user-1',
    createdBy: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    instances: [],
    workspace: null as any,
  };

  const mockInstance: SlaInstance = {
    id: 'inst-1',
    slaDefinitionId: 'def-1',
    slaDefinition: mockDefinition,
    workspaceId: 'ws-1',
    targetType: 'entity',
    targetId: 'entity-1',
    responseDueAt: new Date(Date.now() + 3600000),
    resolutionDueAt: new Date(Date.now() + 28800000),
    responseStatus: 'pending',
    resolutionStatus: 'pending',
    firstResponseAt: null,
    resolvedAt: null,
    isPaused: false,
    pausedAt: null,
    totalPausedMinutes: 0,
    currentEscalationLevel: 0,
    lastEscalationAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    events: [],
    workspace: null as any,
  };

  beforeEach(async () => {
    const mockDefinitionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const mockInstanceRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockEventRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockCalculator = {
      calculateDeadline: jest.fn(),
      calculateRemainingMinutes: jest.fn(),
      calculateUsedPercent: jest.fn(),
    };

    const mockEventsGateway = {
      emitToWorkspace: jest.fn(),
    };

    const mockEntityRepo = {
      findOne: jest.fn(),
    };

    const mockEmailService = {
      sendSlaWarningNotification: jest.fn().mockResolvedValue(true),
      sendSlaBreachNotification: jest.fn().mockResolvedValue(true),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaService,
        { provide: getRepositoryToken(SlaDefinition), useValue: mockDefinitionRepo },
        { provide: getRepositoryToken(SlaInstance), useValue: mockInstanceRepo },
        { provide: getRepositoryToken(SlaEvent), useValue: mockEventRepo },
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
        { provide: SlaCalculatorService, useValue: mockCalculator },
        { provide: EventsGateway, useValue: mockEventsGateway },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SlaService>(SlaService);
    definitionRepository = module.get(getRepositoryToken(SlaDefinition));
    instanceRepository = module.get(getRepositoryToken(SlaInstance));
    eventRepository = module.get(getRepositoryToken(SlaEvent));
    calculator = module.get(SlaCalculatorService);
  });

  describe('createDefinition', () => {
    it('should create and save a new SLA definition', async () => {
      const dto = {
        workspaceId: 'ws-1',
        name: 'New SLA',
        appliesTo: 'entity' as SlaTargetType,
        responseTime: 60,
        resolutionTime: 480,
      };

      definitionRepository.create.mockReturnValue({ ...mockDefinition, ...dto } as SlaDefinition);
      definitionRepository.save.mockResolvedValue({ ...mockDefinition, ...dto } as SlaDefinition);

      const result = await service.createDefinition(dto, 'user-1');

      expect(definitionRepository.create).toHaveBeenCalledWith({
        ...dto,
        createdById: 'user-1',
      });
      expect(definitionRepository.save).toHaveBeenCalled();
      expect(result.name).toBe('New SLA');
    });
  });

  describe('findDefinitions', () => {
    it('should return definitions for workspace', async () => {
      definitionRepository.find.mockResolvedValue([mockDefinition]);

      const result = await service.findDefinitions('ws-1');

      expect(definitionRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { priority: 'DESC', createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findDefinition', () => {
    it('should return definition by id', async () => {
      definitionRepository.findOne.mockResolvedValue(mockDefinition);

      const result = await service.findDefinition('def-1');

      expect(result).toEqual(mockDefinition);
    });

    it('should throw NotFoundException when definition not found', async () => {
      definitionRepository.findOne.mockResolvedValue(null);

      await expect(service.findDefinition('def-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateDefinition', () => {
    it('should update and save definition', async () => {
      const definitionCopy = { ...mockDefinition };
      definitionRepository.findOne.mockResolvedValue(definitionCopy);
      definitionRepository.save.mockResolvedValue({ ...definitionCopy, name: 'Updated SLA' });

      const result = await service.updateDefinition('def-1', { name: 'Updated SLA' });

      expect(definitionRepository.save).toHaveBeenCalled();
      expect(result.name).toBe('Updated SLA');
    });
  });

  describe('deleteDefinition', () => {
    it('should remove definition', async () => {
      definitionRepository.findOne.mockResolvedValue(mockDefinition);

      await service.deleteDefinition('def-1');

      expect(definitionRepository.remove).toHaveBeenCalledWith(mockDefinition);
    });
  });

  describe('createInstance', () => {
    it('should create SLA instance when matching definition found', async () => {
      definitionRepository.find.mockResolvedValue([mockDefinition]);
      calculator.calculateDeadline.mockReturnValue(new Date());
      instanceRepository.create.mockReturnValue(mockInstance);
      instanceRepository.save.mockResolvedValue(mockInstance);
      eventRepository.create.mockReturnValue({} as SlaEvent);
      eventRepository.save.mockResolvedValue({} as SlaEvent);

      const result = await service.createInstance('ws-1', 'entity', 'entity-1', { priority: 'high' });

      expect(result).toBeDefined();
      expect(instanceRepository.create).toHaveBeenCalled();
      expect(eventRepository.create).toHaveBeenCalled();
    });

    it('should return null when no matching definition found', async () => {
      definitionRepository.find.mockResolvedValue([]);

      const result = await service.createInstance('ws-1', 'entity', 'entity-1', {});

      expect(result).toBeNull();
    });

    it('should not match definition when conditions do not match', async () => {
      definitionRepository.find.mockResolvedValue([mockDefinition]);

      const result = await service.createInstance('ws-1', 'entity', 'entity-1', { priority: 'low' });

      expect(result).toBeNull();
    });
  });

  describe('recordResponse', () => {
    it('should record first response and update status', async () => {
      const pendingInstance = { ...mockInstance, responseStatus: 'pending' as SlaStatus };
      instanceRepository.findOne.mockResolvedValue(pendingInstance);
      eventRepository.create.mockReturnValue({} as SlaEvent);
      eventRepository.save.mockResolvedValue({} as SlaEvent);

      await service.recordResponse('entity', 'entity-1');

      expect(instanceRepository.update).toHaveBeenCalled();
      expect(eventRepository.create).toHaveBeenCalled();
    });

    it('should do nothing when no pending instance found', async () => {
      instanceRepository.findOne.mockResolvedValue(null);

      await service.recordResponse('entity', 'entity-1');

      expect(instanceRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('recordResolution', () => {
    it('should record resolution and update status', async () => {
      const pendingInstance = { ...mockInstance, resolutionStatus: 'pending' as SlaStatus };
      instanceRepository.findOne.mockResolvedValue(pendingInstance);
      eventRepository.create.mockReturnValue({} as SlaEvent);
      eventRepository.save.mockResolvedValue({} as SlaEvent);

      await service.recordResolution('entity', 'entity-1');

      expect(instanceRepository.update).toHaveBeenCalled();
      expect(eventRepository.create).toHaveBeenCalled();
    });
  });

  describe('pauseSla', () => {
    it('should pause SLA instance', async () => {
      instanceRepository.findOne.mockResolvedValue(mockInstance);
      eventRepository.create.mockReturnValue({} as SlaEvent);
      eventRepository.save.mockResolvedValue({} as SlaEvent);

      await service.pauseSla('inst-1', 'Waiting for customer');

      expect(instanceRepository.update).toHaveBeenCalledWith('inst-1', {
        isPaused: true,
        pausedAt: expect.any(Date),
      });
    });

    it('should throw NotFoundException when instance not found', async () => {
      instanceRepository.findOne.mockResolvedValue(null);

      await expect(service.pauseSla('inst-1', 'reason')).rejects.toThrow(NotFoundException);
    });

    it('should return instance unchanged if already paused', async () => {
      const pausedInstance = { ...mockInstance, isPaused: true };
      instanceRepository.findOne.mockResolvedValue(pausedInstance);

      const result = await service.pauseSla('inst-1', 'reason');

      expect(instanceRepository.update).not.toHaveBeenCalled();
      expect(result).toEqual(pausedInstance);
    });
  });

  describe('resumeSla', () => {
    it('should resume paused SLA and calculate paused time', async () => {
      const pausedAt = new Date(Date.now() - 30 * 60000); // 30 minutes ago
      const pausedInstance = { ...mockInstance, isPaused: true, pausedAt, totalPausedMinutes: 0 };
      instanceRepository.findOne
        .mockResolvedValueOnce(pausedInstance)
        .mockResolvedValueOnce({ ...pausedInstance, isPaused: false });
      eventRepository.create.mockReturnValue({} as SlaEvent);
      eventRepository.save.mockResolvedValue({} as SlaEvent);

      await service.resumeSla('inst-1');

      expect(instanceRepository.update).toHaveBeenCalledWith('inst-1', {
        isPaused: false,
        pausedAt: null,
        totalPausedMinutes: expect.any(Number),
      });
    });

    it('should return instance unchanged if not paused', async () => {
      instanceRepository.findOne.mockResolvedValue(mockInstance);

      const result = await service.resumeSla('inst-1');

      expect(instanceRepository.update).not.toHaveBeenCalled();
      expect(result).toEqual(mockInstance);
    });
  });

  describe('getStatus', () => {
    it('should return status info for target', async () => {
      instanceRepository.findOne.mockResolvedValue(mockInstance);
      calculator.calculateRemainingMinutes.mockReturnValue(30);
      calculator.calculateUsedPercent.mockReturnValue(50);

      const result = await service.getStatus('entity', 'entity-1');

      expect(result).toBeDefined();
      expect(result!.instanceId).toBe('inst-1');
      expect(result!.definitionName).toBe('Test SLA');
    });

    it('should return null when no instance found', async () => {
      instanceRepository.findOne.mockResolvedValue(null);

      const result = await service.getStatus('entity', 'entity-1');

      expect(result).toBeNull();
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard statistics', async () => {
      const instances = [
        { ...mockInstance, resolutionStatus: 'met' as SlaStatus },
        { ...mockInstance, id: 'inst-2', resolutionStatus: 'breached' as SlaStatus },
        { ...mockInstance, id: 'inst-3', resolutionStatus: 'pending' as SlaStatus },
      ];
      instanceRepository.find.mockResolvedValue(instances);
      calculator.calculateUsedPercent.mockReturnValue(50);

      const result = await service.getDashboard('ws-1');

      expect(result.total).toBe(3);
      expect(result.met).toBe(1);
      expect(result.breached).toBe(1);
      expect(result.pending).toBe(1);
    });
  });
});
