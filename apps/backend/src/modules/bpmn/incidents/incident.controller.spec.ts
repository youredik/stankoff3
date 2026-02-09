import { Test, TestingModule } from '@nestjs/testing';
import { IncidentController } from './incident.controller';
import { IncidentService, IncidentInfo } from './incident.service';
import { ProcessInstanceStatus } from '../entities/process-instance.entity';

describe('IncidentController', () => {
  let controller: IncidentController;
  let incidentService: jest.Mocked<IncidentService>;

  const mockIncident: IncidentInfo = {
    id: 'inst-1',
    processInstanceKey: 'instance-456',
    processDefinitionKey: 'key-123',
    definitionName: 'Test Process',
    entityId: 'entity-1',
    entityTitle: 'Заявка тестовая',
    entityCustomId: 'WS-001',
    workspaceId: 'ws-1',
    errorMessage: 'Worker failed',
    startedAt: new Date(),
    updatedAt: new Date(),
    variables: { lastError: 'Worker failed' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentController],
      providers: [
        {
          provide: IncidentService,
          useValue: {
            findIncidents: jest.fn(),
            getIncidentCount: jest.fn(),
            retryIncident: jest.fn(),
            cancelIncident: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<IncidentController>(IncidentController);
    incidentService = module.get(IncidentService);
  });

  describe('findIncidents', () => {
    it('должен вернуть список инцидентов для workspace', async () => {
      incidentService.findIncidents.mockResolvedValue([mockIncident]);

      const result = await controller.findIncidents('ws-1');

      expect(result).toEqual([mockIncident]);
      expect(incidentService.findIncidents).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getIncidentCount', () => {
    it('должен вернуть count в обёрнутом объекте', async () => {
      incidentService.getIncidentCount.mockResolvedValue(3);

      const result = await controller.getIncidentCount('ws-1');

      expect(result).toEqual({ count: 3 });
      expect(incidentService.getIncidentCount).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('retryIncident', () => {
    it('должен вызвать retryIncident и вернуть instance', async () => {
      const retried = {
        id: 'inst-1',
        status: ProcessInstanceStatus.ACTIVE,
      } as any;
      incidentService.retryIncident.mockResolvedValue(retried);

      const result = await controller.retryIncident('inst-1');

      expect(result).toEqual(retried);
      expect(incidentService.retryIncident).toHaveBeenCalledWith('inst-1');
    });
  });

  describe('cancelIncident', () => {
    it('должен вызвать cancelIncident и вернуть { success: true }', async () => {
      incidentService.cancelIncident.mockResolvedValue(undefined);

      const result = await controller.cancelIncident('inst-1');

      expect(result).toEqual({ success: true });
      expect(incidentService.cancelIncident).toHaveBeenCalledWith('inst-1');
    });
  });
});
