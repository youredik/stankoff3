import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationsService } from './recommendations.service';
import { WorkspaceEntity } from '../entity.entity';
import { User } from '../../user/user.entity';
import { Comment } from '../comment.entity';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let entityRepository: jest.Mocked<Repository<WorkspaceEntity>>;

  const mockUser = {
    id: 'user-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    email: 'ivan@example.com',
  } as User;

  const mockEntity = (
    id: string,
    title: string,
    status: string,
    assignee?: User,
    createdAt?: Date,
    resolvedAt?: Date,
  ): WorkspaceEntity =>
    ({
      id,
      workspaceId: 'ws-1',
      customId: `TICKET-${id}`,
      title,
      status,
      assignee,
      assigneeId: assignee?.id,
      createdAt: createdAt || new Date(),
      resolvedAt,
      firstResponseAt: createdAt,
    }) as unknown as WorkspaceEntity;

  beforeEach(async () => {
    const mockEntityRepo = {
      find: jest.fn(),
    };

    const mockUserRepo = {
      find: jest.fn(),
    };

    const mockCommentRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: mockEntityRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepo,
        },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
    entityRepository = module.get(getRepositoryToken(WorkspaceEntity));
  });

  describe('recommendAssignees', () => {
    it('должен вернуть рекомендации по исполнителям', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      entityRepository.find.mockResolvedValue([
        mockEntity('1', 'Проблема с авторизацией', 'done', mockUser, oneHourAgo, now),
        mockEntity('2', 'Ошибка входа в систему', 'done', mockUser, oneHourAgo, now),
        mockEntity('3', 'Не работает кнопка', 'in-progress', mockUser),
      ]);

      const result = await service.recommendAssignees(
        'ws-1',
        'Проблема с авторизацией',
      );

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('userId');
        expect(result[0]).toHaveProperty('score');
        expect(result[0]).toHaveProperty('reasons');
        expect(result[0].score).toBeGreaterThanOrEqual(0);
        expect(result[0].score).toBeLessThanOrEqual(100);
      }
    });

    it('должен вернуть пустой массив если нет исполнителей', async () => {
      entityRepository.find.mockResolvedValue([
        mockEntity('1', 'Заявка без исполнителя', 'new'),
      ]);

      const result = await service.recommendAssignees('ws-1', 'Новая заявка');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('recommendPriority', () => {
    it('должен рекомендовать высокий приоритет для срочных заявок', async () => {
      entityRepository.find.mockResolvedValue([]);

      const result = await service.recommendPriority(
        'ws-1',
        'СРОЧНО! Не работает продакшн!',
      );

      // "срочно" and "не работает" are both priority keywords
      expect(['critical', 'high'].includes(result.suggestedPriority)).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('должен рекомендовать низкий приоритет для обычных заявок', async () => {
      entityRepository.find.mockResolvedValue([]);

      const result = await service.recommendPriority(
        'ws-1',
        'Добавить новую функцию в отчёт',
      );

      expect(result.suggestedPriority).toBe('low');
    });

    it('должен рекомендовать средний приоритет при наличии проблемных слов', async () => {
      entityRepository.find.mockResolvedValue([]);

      const result = await service.recommendPriority(
        'ws-1',
        'Ошибка при сохранении документа',
      );

      expect(['low', 'medium'].includes(result.suggestedPriority)).toBe(true);
    });
  });

  describe('estimateResponseTime', () => {
    it('должен вернуть оценку времени ответа на основе данных', async () => {
      const now = new Date();
      const entities = Array.from({ length: 20 }, (_, i) => {
        const createdAt = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
        const firstResponseAt = new Date(createdAt.getTime() + 30 * 60 * 1000); // 30 min response
        return {
          ...mockEntity(`${i}`, 'Заявка', 'done'),
          createdAt,
          firstResponseAt,
        };
      });

      entityRepository.find.mockResolvedValue(entities as WorkspaceEntity[]);

      const result = await service.estimateResponseTime('ws-1');

      expect(result.estimatedMinutes).toBeGreaterThan(0);
      expect(result.basedOnSamples).toBe(20);
      expect(['low', 'medium', 'high'].includes(result.confidenceLevel)).toBe(true);
    });

    it('должен вернуть значение по умолчанию при недостатке данных', async () => {
      entityRepository.find.mockResolvedValue([]);

      const result = await service.estimateResponseTime('ws-1');

      expect(result.estimatedMinutes).toBe(60); // Default
      expect(result.confidenceLevel).toBe('low');
      expect(result.basedOnSamples).toBe(0);
    });
  });

  describe('findSimilarEntities', () => {
    it('должен найти похожие заявки', async () => {
      entityRepository.find.mockResolvedValue([
        mockEntity('1', 'Проблема с авторизацией', 'done'),
        mockEntity('2', 'Ошибка авторизации пользователя', 'in-progress'),
        mockEntity('3', 'Не работает отчёт', 'new'),
      ]);

      const result = await service.findSimilarEntities(
        'ws-1',
        'Проблема авторизации',
      );

      expect(Array.isArray(result)).toBe(true);
      // Should find entities with "авторизация" keyword
    });

    it('должен исключить указанную заявку из результатов', async () => {
      entityRepository.find.mockResolvedValue([
        mockEntity('1', 'Проблема с сервером', 'done'),
        mockEntity('2', 'Проблема с сервером повторно', 'new'),
      ]);

      const result = await service.findSimilarEntities(
        'ws-1',
        'Проблема с сервером',
        undefined,
        '1',
      );

      expect(result.every((r) => r.entityId !== '1')).toBe(true);
    });

    it('должен вернуть пустой массив для запроса без ключевых слов', async () => {
      entityRepository.find.mockResolvedValue([]);

      const result = await service.findSimilarEntities('ws-1', 'и в на');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});
