import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { IncidentService } from './incident.service';
import {
  ProcessInstance,
  ProcessInstanceStatus,
} from '../entities/process-instance.entity';
import { BpmnService } from '../bpmn.service';
import { EventsGateway } from '../../websocket/events.gateway';

describe('IncidentService', () => {
  let service: IncidentService;
  let instanceRepository: jest.Mocked<Repository<ProcessInstance>>;
  let bpmnService: jest.Mocked<BpmnService>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  const mockInstance: ProcessInstance = {
    id: 'inst-1',
    workspaceId: 'ws-1',
    entityId: 'entity-1',
    processDefinitionId: 'def-1',
    processDefinition: {
      id: 'def-1',
      name: 'Test Process',
    } as any,
    processDefinitionKey: 'key-123',
    processInstanceKey: 'instance-456',
    businessKey: 'entity-1',
    variables: {},
    status: ProcessInstanceStatus.INCIDENT,
    startedAt: new Date('2026-01-15'),
    completedAt: null as any,
    startedById: 'user-1',
    startedBy: undefined as any,
    workspace: undefined as any,
    entity: {
      id: 'entity-1',
      title: 'Заявка тестовая',
      customId: 'WS-001',
    } as any,
    updatedAt: new Date('2026-01-16'),
  };

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentService,
        {
          provide: getRepositoryToken(ProcessInstance),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: BpmnService,
          useValue: {
            cancelInstance: jest.fn(),
          },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitToWorkspace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IncidentService>(IncidentService);
    instanceRepository = module.get(getRepositoryToken(ProcessInstance));
    bpmnService = module.get(BpmnService);
    eventsGateway = module.get(EventsGateway);
  });

  describe('findIncidents', () => {
    it('должен вернуть список инцидентов для workspace', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([mockInstance]);

      const result = await service.findIncidents('ws-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'inst-1',
        processInstanceKey: 'instance-456',
        processDefinitionKey: 'key-123',
        definitionName: 'Test Process',
        entityId: 'entity-1',
        entityTitle: 'Заявка тестовая',
        entityCustomId: 'WS-001',
        workspaceId: 'ws-1',
        errorMessage: undefined,
        startedAt: mockInstance.startedAt,
        updatedAt: mockInstance.updatedAt,
        variables: {},
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'pi.workspaceId = :workspaceId',
        { workspaceId: 'ws-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'pi.status = :status',
        { status: ProcessInstanceStatus.INCIDENT },
      );
    });

    it('должен вернуть errorMessage из variables.lastError', async () => {
      const instanceWithError = {
        ...mockInstance,
        variables: { lastError: 'Worker timeout' },
      };
      mockQueryBuilder.getMany.mockResolvedValue([instanceWithError]);

      const result = await service.findIncidents('ws-1');

      expect(result[0].errorMessage).toBe('Worker timeout');
    });

    it('должен вернуть пустой массив если нет инцидентов', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.findIncidents('ws-1');

      expect(result).toEqual([]);
    });

    it('должен обрабатывать instance без entity', async () => {
      const instanceWithoutEntity = {
        ...mockInstance,
        entityId: null,
        entity: null,
      };
      mockQueryBuilder.getMany.mockResolvedValue([instanceWithoutEntity]);

      const result = await service.findIncidents('ws-1');

      expect(result[0].entityId).toBeUndefined();
      expect(result[0].entityTitle).toBeUndefined();
      expect(result[0].entityCustomId).toBeUndefined();
    });
  });

  describe('getIncidentCount', () => {
    it('должен вернуть количество инцидентов', async () => {
      instanceRepository.count.mockResolvedValue(5);

      const result = await service.getIncidentCount('ws-1');

      expect(result).toBe(5);
      expect(instanceRepository.count).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          status: ProcessInstanceStatus.INCIDENT,
        },
      });
    });

    it('должен вернуть 0 если инцидентов нет', async () => {
      instanceRepository.count.mockResolvedValue(0);

      const result = await service.getIncidentCount('ws-1');

      expect(result).toBe(0);
    });
  });

  describe('markAsIncident', () => {
    it('должен пометить instance как incident и отправить WebSocket событие', async () => {
      const activeInstance = {
        ...mockInstance,
        status: ProcessInstanceStatus.ACTIVE,
        variables: { someData: 'test' },
      };
      instanceRepository.findOne.mockResolvedValue(activeInstance);
      instanceRepository.save.mockImplementation(async (i) => i as ProcessInstance);

      await service.markAsIncident('instance-456', 'Worker failed');

      expect(instanceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProcessInstanceStatus.INCIDENT,
          variables: expect.objectContaining({
            someData: 'test',
            lastError: 'Worker failed',
            incidentAt: expect.any(String),
          }),
        }),
      );
      expect(eventsGateway.emitToWorkspace).toHaveBeenCalledWith(
        'ws-1',
        'process:incident',
        {
          processInstanceId: 'inst-1',
          processInstanceKey: 'instance-456',
          errorMessage: 'Worker failed',
        },
      );
    });

    it('должен игнорировать если instance не найден', async () => {
      instanceRepository.findOne.mockResolvedValue(null);

      await service.markAsIncident('unknown-key', 'Error');

      expect(instanceRepository.save).not.toHaveBeenCalled();
      expect(eventsGateway.emitToWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('cancelIncident', () => {
    it('должен отменить процесс через BpmnService', async () => {
      instanceRepository.findOne.mockResolvedValue(mockInstance);

      await service.cancelIncident('inst-1');

      expect(bpmnService.cancelInstance).toHaveBeenCalledWith('instance-456');
    });

    it('должен выбросить NotFoundException если instance не найден', async () => {
      instanceRepository.findOne.mockResolvedValue(null);

      await expect(service.cancelIncident('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('retryIncident', () => {
    it('должен сбросить статус на ACTIVE и очистить ошибку', async () => {
      const incidentInstance = {
        ...mockInstance,
        status: ProcessInstanceStatus.INCIDENT,
        variables: { lastError: 'Some error', incidentAt: '2026-01-16T00:00:00Z', data: 'keep' },
      };
      instanceRepository.findOne.mockResolvedValue(incidentInstance);
      instanceRepository.save.mockImplementation(async (i) => i as ProcessInstance);

      const result = await service.retryIncident('inst-1');

      expect(result.status).toBe(ProcessInstanceStatus.ACTIVE);
      expect(result.variables.lastError).toBeUndefined();
      expect(result.variables.incidentAt).toBeUndefined();
      expect(result.variables.retriedAt).toBeDefined();
      expect(result.variables.data).toBe('keep');
    });

    it('должен выбросить NotFoundException если instance не найден', async () => {
      instanceRepository.findOne.mockResolvedValue(null);

      await expect(service.retryIncident('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('должен загружать relations processDefinition', async () => {
      instanceRepository.findOne.mockResolvedValue(mockInstance);
      instanceRepository.save.mockImplementation(async (i) => i as ProcessInstance);

      await service.retryIncident('inst-1');

      expect(instanceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'inst-1' },
        relations: ['processDefinition'],
      });
    });
  });
});
