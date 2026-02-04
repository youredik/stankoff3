import { Test, TestingModule } from '@nestjs/testing';
import { ProcessMiningController } from './process-mining.controller';
import {
  ProcessMiningService,
  ProcessMiningStats,
  TimeAnalysis,
} from './process-mining.service';

describe('ProcessMiningController', () => {
  let controller: ProcessMiningController;
  let service: jest.Mocked<ProcessMiningService>;

  const mockDefinitionId = '123e4567-e89b-12d3-a456-426614174000';
  const mockWorkspaceId = '223e4567-e89b-12d3-a456-426614174001';

  const mockProcessStats: ProcessMiningStats = {
    definitionId: mockDefinitionId,
    definitionName: 'Согласование документа',
    totalInstances: 100,
    completedInstances: 75,
    activeInstances: 20,
    terminatedInstances: 3,
    incidentInstances: 2,
    avgDurationMinutes: 45.5,
    minDurationMinutes: 5,
    maxDurationMinutes: 240,
    medianDurationMinutes: 35,
    completionRate: 75,
    instancesByDay: [
      { date: '2026-01-01', count: 10 },
      { date: '2026-01-02', count: 15 },
    ],
    durationDistribution: [
      { bucket: '< 5 мин', count: 10 },
      { bucket: '5-15 мин', count: 25 },
      { bucket: '15-30 мин', count: 30 },
    ],
  };

  const mockTimeAnalysis: TimeAnalysis = {
    dayOfWeekStats: [
      { day: 'Понедельник', avgInstances: 15, avgDuration: 40 },
      { day: 'Вторник', avgInstances: 20, avgDuration: 35 },
    ],
    hourlyStats: [
      { hour: 9, avgInstances: 5 },
      { hour: 10, avgInstances: 8 },
    ],
    trendLine: [
      { date: '2026-01-01', instances: 10, avgDuration: 45 },
      { date: '2026-01-02', instances: 15, avgDuration: 38 },
    ],
  };

  const mockWorkspaceStats = {
    totalDefinitions: 5,
    totalInstances: 250,
    avgCompletionRate: 80,
    avgDurationMinutes: 55,
    topProcessesByVolume: [
      { name: 'Согласование', count: 100 },
      { name: 'Заявка на отпуск', count: 80 },
    ],
    topProcessesByDuration: [
      { name: 'Закупка', avgMinutes: 120 },
      { name: 'Онбординг', avgMinutes: 90 },
    ],
    statusDistribution: [
      { status: 'completed', count: 200 },
      { status: 'active', count: 40 },
      { status: 'terminated', count: 10 },
    ],
  };

  beforeEach(async () => {
    const mockService = {
      getProcessStats: jest.fn(),
      getTimeAnalysis: jest.fn(),
      getWorkspaceStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessMiningController],
      providers: [
        {
          provide: ProcessMiningService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ProcessMiningController>(ProcessMiningController);
    service = module.get(ProcessMiningService);
  });

  describe('getProcessStats', () => {
    it('должен вернуть статистику процесса', async () => {
      service.getProcessStats.mockResolvedValue(mockProcessStats);

      const result = await controller.getProcessStats(mockDefinitionId);

      expect(result).toEqual(mockProcessStats);
      expect(service.getProcessStats).toHaveBeenCalledWith(
        mockDefinitionId,
        undefined,
        undefined,
      );
    });

    it('должен передать фильтр по датам', async () => {
      service.getProcessStats.mockResolvedValue(mockProcessStats);

      const startDate = '2026-01-01T00:00:00.000Z';
      const endDate = '2026-01-31T23:59:59.999Z';

      await controller.getProcessStats(mockDefinitionId, startDate, endDate);

      expect(service.getProcessStats).toHaveBeenCalledWith(
        mockDefinitionId,
        new Date(startDate),
        new Date(endDate),
      );
    });
  });

  describe('getTimeAnalysis', () => {
    it('должен вернуть временной анализ', async () => {
      service.getTimeAnalysis.mockResolvedValue(mockTimeAnalysis);

      const result = await controller.getTimeAnalysis(mockDefinitionId);

      expect(result).toEqual(mockTimeAnalysis);
      expect(service.getTimeAnalysis).toHaveBeenCalledWith(
        mockDefinitionId,
        undefined,
        undefined,
      );
    });

    it('должен передать фильтр по датам', async () => {
      service.getTimeAnalysis.mockResolvedValue(mockTimeAnalysis);

      const startDate = '2026-01-01';
      const endDate = '2026-01-31';

      await controller.getTimeAnalysis(mockDefinitionId, startDate, endDate);

      expect(service.getTimeAnalysis).toHaveBeenCalledWith(
        mockDefinitionId,
        new Date(startDate),
        new Date(endDate),
      );
    });
  });

  describe('getWorkspaceStats', () => {
    it('должен вернуть статистику workspace', async () => {
      service.getWorkspaceStats.mockResolvedValue(mockWorkspaceStats);

      const result = await controller.getWorkspaceStats(mockWorkspaceId);

      expect(result).toEqual(mockWorkspaceStats);
      expect(service.getWorkspaceStats).toHaveBeenCalledWith(
        mockWorkspaceId,
        undefined,
        undefined,
      );
    });

    it('должен передать фильтр по датам', async () => {
      service.getWorkspaceStats.mockResolvedValue(mockWorkspaceStats);

      const startDate = '2026-01-01';
      const endDate = '2026-01-31';

      await controller.getWorkspaceStats(mockWorkspaceId, startDate, endDate);

      expect(service.getWorkspaceStats).toHaveBeenCalledWith(
        mockWorkspaceId,
        new Date(startDate),
        new Date(endDate),
      );
    });
  });
});
