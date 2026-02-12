import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFeedbackService } from './ai-feedback.service';
import { AiFeedback } from '../entities/ai-feedback.entity';

describe('AiFeedbackService', () => {
  let service: AiFeedbackService;
  let repo: jest.Mocked<Repository<AiFeedback>>;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFeedbackService,
        { provide: getRepositoryToken(AiFeedback), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<AiFeedbackService>(AiFeedbackService);
    repo = module.get(getRepositoryToken(AiFeedback));
  });

  describe('submitFeedback', () => {
    it('должен создать новый feedback', async () => {
      const feedback = {
        id: 'fb-1',
        type: 'response' as const,
        entityId: 'ent-1',
        userId: 'user-1',
        rating: 'positive' as const,
        metadata: { action: 'copy' },
        createdAt: new Date(),
      };

      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(feedback as unknown as AiFeedback);
      repo.save.mockResolvedValue(feedback as unknown as AiFeedback);

      const result = await service.submitFeedback({
        type: 'response',
        entityId: 'ent-1',
        userId: 'user-1',
        rating: 'positive',
        metadata: { action: 'copy' },
      });

      expect(repo.findOne).toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith({
        type: 'response',
        entityId: 'ent-1',
        userId: 'user-1',
        rating: 'positive',
        metadata: { action: 'copy' },
      });
      expect(result.rating).toBe('positive');
    });

    it('должен обновить существующий feedback (upsert)', async () => {
      const existing = {
        id: 'fb-1',
        type: 'response' as const,
        entityId: 'ent-1',
        userId: 'user-1',
        rating: 'positive' as const,
        metadata: { action: 'copy' },
        createdAt: new Date(),
      };

      repo.findOne.mockResolvedValue(existing as unknown as AiFeedback);
      repo.save.mockImplementation(async (entity) => entity as unknown as AiFeedback);

      const result = await service.submitFeedback({
        type: 'response',
        entityId: 'ent-1',
        userId: 'user-1',
        rating: 'negative',
        metadata: { reason: 'irrelevant' },
      });

      expect(result.rating).toBe('negative');
      expect(result.metadata).toEqual({ action: 'copy', reason: 'irrelevant' });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('getFeedbackStats', () => {
    it('должен вернуть корректную статистику', async () => {
      const feedbacks = [
        { type: 'response', rating: 'positive' },
        { type: 'response', rating: 'positive' },
        { type: 'response', rating: 'negative' },
        { type: 'classification', rating: 'positive' },
      ];

      const mockQb = {
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(feedbacks),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.getFeedbackStats();

      expect(result.totalPositive).toBe(3);
      expect(result.totalNegative).toBe(1);
      expect(result.satisfactionRate).toBe(75);
      expect(result.byType.response).toEqual({ positive: 2, negative: 1 });
      expect(result.byType.classification).toEqual({ positive: 1, negative: 0 });
    });

    it('должен вернуть 0% satisfaction при отсутствии feedback', async () => {
      const mockQb = {
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.getFeedbackStats();

      expect(result.totalPositive).toBe(0);
      expect(result.totalNegative).toBe(0);
      expect(result.satisfactionRate).toBe(0);
    });
  });

  describe('getUserFeedbackForEntity', () => {
    it('должен вернуть feedback пользователя', async () => {
      const feedbacks = [
        { id: 'fb-1', type: 'response', rating: 'positive' },
      ];
      repo.find.mockResolvedValue(feedbacks as unknown as AiFeedback[]);

      const result = await service.getUserFeedbackForEntity('ent-1', 'user-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { entityId: 'ent-1', userId: 'user-1' },
      });
      expect(result).toHaveLength(1);
    });

    it('должен фильтровать по типу', async () => {
      repo.find.mockResolvedValue([]);

      await service.getUserFeedbackForEntity('ent-1', 'user-1', 'response');

      expect(repo.find).toHaveBeenCalledWith({
        where: { entityId: 'ent-1', userId: 'user-1', type: 'response' },
      });
    });
  });
});
