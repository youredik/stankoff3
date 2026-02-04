import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsController } from './recommendations.controller';
import {
  RecommendationsService,
  AssigneeRecommendation,
  PriorityRecommendation,
  ResponseTimeEstimate,
  SimilarEntity,
} from './recommendations.service';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let service: jest.Mocked<RecommendationsService>;

  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174000';

  const mockAssigneeRecommendations: AssigneeRecommendation[] = [
    {
      userId: 'user-1',
      user: {
        id: 'user-1',
        firstName: 'Иван',
        lastName: 'Иванов',
        email: 'ivan@example.com',
      },
      score: 85,
      reasons: ['Низкая нагрузка', 'Высокий процент завершения'],
    },
    {
      userId: 'user-2',
      user: {
        id: 'user-2',
        firstName: 'Пётр',
        lastName: 'Петров',
        email: 'petr@example.com',
      },
      score: 72,
      reasons: ['Опыт с похожими заявками'],
    },
  ];

  const mockPriorityRecommendation: PriorityRecommendation = {
    suggestedPriority: 'high',
    confidence: 0.85,
    reasons: ['Обнаружено ключевое слово: срочно'],
  };

  const mockResponseTimeEstimate: ResponseTimeEstimate = {
    estimatedMinutes: 30,
    confidenceLevel: 'medium',
    basedOnSamples: 15,
    factors: ['Среднее время по workspace', 'Текущая нагрузка'],
  };

  const mockSimilarEntities: SimilarEntity[] = [
    {
      entityId: 'entity-1',
      customId: 'TICKET-001',
      title: 'Похожая проблема с авторизацией',
      similarity: 0.78,
      status: 'done',
      matchingTerms: ['авторизация', 'проблема'],
    },
  ];

  beforeEach(async () => {
    const mockService = {
      recommendAssignees: jest.fn(),
      recommendPriority: jest.fn(),
      estimateResponseTime: jest.fn(),
      findSimilarEntities: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        {
          provide: RecommendationsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<RecommendationsController>(RecommendationsController);
    service = module.get(RecommendationsService);
  });

  describe('recommendAssignees', () => {
    it('должен вернуть рекомендации исполнителей', async () => {
      service.recommendAssignees.mockResolvedValue(mockAssigneeRecommendations);

      const result = await controller.recommendAssignees(
        mockWorkspaceId,
        'Проблема с авторизацией',
        'Не могу войти в систему',
        '5',
      );

      expect(result).toEqual(mockAssigneeRecommendations);
      expect(service.recommendAssignees).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Проблема с авторизацией',
        'Не могу войти в систему',
        5,
      );
    });

    it('должен использовать значение по умолчанию для limit', async () => {
      service.recommendAssignees.mockResolvedValue(mockAssigneeRecommendations);

      await controller.recommendAssignees(
        mockWorkspaceId,
        'Тест',
        undefined,
        undefined,
      );

      expect(service.recommendAssignees).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Тест',
        undefined,
        5,
      );
    });
  });

  describe('recommendPriority', () => {
    it('должен вернуть рекомендацию приоритета', async () => {
      service.recommendPriority.mockResolvedValue(mockPriorityRecommendation);

      const result = await controller.recommendPriority(
        mockWorkspaceId,
        'СРОЧНО! Не работает сервер',
        'Полное описание проблемы',
      );

      expect(result).toEqual(mockPriorityRecommendation);
      expect(service.recommendPriority).toHaveBeenCalledWith(
        mockWorkspaceId,
        'СРОЧНО! Не работает сервер',
        'Полное описание проблемы',
      );
    });

    it('должен работать без описания', async () => {
      service.recommendPriority.mockResolvedValue(mockPriorityRecommendation);

      await controller.recommendPriority(
        mockWorkspaceId,
        'Заявка без описания',
        undefined,
      );

      expect(service.recommendPriority).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Заявка без описания',
        undefined,
      );
    });
  });

  describe('estimateResponseTime', () => {
    it('должен вернуть оценку времени ответа', async () => {
      service.estimateResponseTime.mockResolvedValue(mockResponseTimeEstimate);

      const result = await controller.estimateResponseTime(
        mockWorkspaceId,
        'Проблема с принтером',
        'user-1',
      );

      expect(result).toEqual(mockResponseTimeEstimate);
      expect(service.estimateResponseTime).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Проблема с принтером',
        'user-1',
      );
    });

    it('должен работать только с workspaceId', async () => {
      service.estimateResponseTime.mockResolvedValue(mockResponseTimeEstimate);

      await controller.estimateResponseTime(
        mockWorkspaceId,
        undefined,
        undefined,
      );

      expect(service.estimateResponseTime).toHaveBeenCalledWith(
        mockWorkspaceId,
        undefined,
        undefined,
      );
    });
  });

  describe('findSimilarEntities', () => {
    it('должен найти похожие заявки', async () => {
      service.findSimilarEntities.mockResolvedValue(mockSimilarEntities);

      const result = await controller.findSimilarEntities(
        mockWorkspaceId,
        'Проблема с авторизацией',
        'Описание проблемы',
        'exclude-entity-id',
        '10',
      );

      expect(result).toEqual(mockSimilarEntities);
      expect(service.findSimilarEntities).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Проблема с авторизацией',
        'Описание проблемы',
        'exclude-entity-id',
        10,
      );
    });

    it('должен использовать значения по умолчанию', async () => {
      service.findSimilarEntities.mockResolvedValue([]);

      await controller.findSimilarEntities(
        mockWorkspaceId,
        'Тест',
        undefined,
        undefined,
        undefined,
      );

      expect(service.findSimilarEntities).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Тест',
        undefined,
        undefined,
        5,
      );
    });
  });
});
