import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAssistantService } from './ai-assistant.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LegacyUrlService } from '../../legacy/services/legacy-url.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { Comment } from '../../entity/comment.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let knowledgeBaseService: jest.Mocked<KnowledgeBaseService>;
  let legacyUrlService: jest.Mocked<LegacyUrlService>;
  let providerRegistry: jest.Mocked<AiProviderRegistry>;
  let usageLogRepo: jest.Mocked<Repository<AiUsageLog>>;

  const mockEntity = {
    id: 'entity-1',
    title: 'Проблема с подшипником серводвигателя',
    workspaceId: 'ws-1',
    assigneeId: null,
    data: { description: 'При запуске станка слышен скрежет в области серводвигателя' },
  } as unknown as WorkspaceEntity;

  const mockSearchResults = [
    {
      id: 'chunk-1',
      content: 'Замена подшипника серводвигателя: демонтировать двигатель, заменить подшипник SKF 6205...',
      sourceType: 'legacy_request',
      sourceId: 'req-1',
      metadata: {
        requestId: 45231,
        subject: 'Замена подшипника серводвигателя Fanuc',
        managerName: 'Иванов Иван',
        managerId: 12,
        managerDepartment: 'Сервис',
        specialists: [{ id: 15, name: 'Петров Сергей' }],
        specialistNames: ['Петров Сергей'],
        resolutionTimeHours: 4.5,
        counterpartyName: 'ООО МеталлСтрой',
        counterpartyUrl: 'https://legacy.example.com/counterparty/100',
        relatedDeals: [{ id: 1, name: 'Поставка CNC-2000', sum: 2500000, url: 'https://legacy.example.com/deal/1' }],
        customerTotalRequests: 47,
      },
      similarity: 0.92,
    },
    {
      id: 'chunk-2',
      content: 'Диагностика серводвигателя: проверить подшипники, обмотку...',
      sourceType: 'legacy_request',
      sourceId: 'req-2',
      metadata: {
        requestId: 38102,
        subject: 'Диагностика серводвигателя после перегрева',
        managerName: 'Иванов Иван',
        managerId: 12,
        specialists: [],
        specialistNames: [],
        resolutionTimeHours: 8,
      },
      similarity: 0.87,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: KnowledgeBaseService,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(true),
            searchSimilar: jest.fn(),
          },
        },
        {
          provide: LegacyUrlService,
          useValue: {
            getRequestUrl: jest.fn((id: number) => `https://legacy.example.com/crm/request/${id}`),
          },
        },
        {
          provide: AiProviderRegistry,
          useValue: {
            isCompletionAvailable: jest.fn().mockReturnValue(true),
            complete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AiUsageLog),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    knowledgeBaseService = module.get(KnowledgeBaseService);
    legacyUrlService = module.get(LegacyUrlService);
    providerRegistry = module.get(AiProviderRegistry);
    usageLogRepo = module.get(getRepositoryToken(AiUsageLog));

    // Сбрасываем кэш между тестами
    service.invalidateCache('entity-1');
    service.invalidateCache('entity-2');
  });

  describe('getAssistance', () => {
    it('должен вернуть available: false если AI недоступен', async () => {
      knowledgeBaseService.isAvailable.mockReturnValue(false);

      const result = await service.getAssistance('entity-1');

      expect(result.available).toBe(false);
      expect(result.similarCases).toEqual([]);
      expect(result.suggestedExperts).toEqual([]);
    });

    it('должен вернуть пустой результат если entity не найден', async () => {
      entityRepo.findOne.mockResolvedValue(null);

      const result = await service.getAssistance('nonexistent');

      expect(result.available).toBe(true);
      expect(result.similarCases).toEqual([]);
    });

    it('должен вернуть пустой результат если title слишком короткий', async () => {
      entityRepo.findOne.mockResolvedValue({
        ...mockEntity,
        title: 'Тест',
        data: {},
      } as unknown as WorkspaceEntity);

      const result = await service.getAssistance('entity-1');

      expect(result.available).toBe(true);
      expect(result.similarCases).toEqual([]);
      expect(knowledgeBaseService.searchSimilar).not.toHaveBeenCalled();
    });

    it('должен найти похожие случаи и экспертов', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      const result = await service.getAssistance('entity-1');

      expect(result.available).toBe(true);
      expect(result.similarCases).toHaveLength(2);
      expect(result.similarCases[0].requestId).toBe(45231);
      expect(result.similarCases[0].similarity).toBe(0.92);
      expect(result.similarCases[0].legacyUrl).toContain('45231');

      expect(result.suggestedExperts.length).toBeGreaterThan(0);
      expect(result.suggestedExperts[0].name).toBe('Иванов Иван');
      expect(result.suggestedExperts[0].relevantCases).toBe(2);
    });

    it('должен извлекать контекст контрагента', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      const result = await service.getAssistance('entity-1');

      expect(result.relatedContext).toBeDefined();
      expect(result.relatedContext!.counterpartyName).toBe('ООО МеталлСтрой');
      expect(result.relatedContext!.deals).toHaveLength(1);
      expect(result.relatedContext!.customerTotalRequests).toBe(47);
    });

    it('должен извлекать avgResolutionTimeHours из searchResults', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      const result = await service.getAssistance('entity-1');

      expect(result.relatedContext).toBeDefined();
      // mockSearchResults: 4.5 + 8 = 12.5, среднее = 6.25
      expect(result.relatedContext!.avgResolutionTimeHours).toBeCloseTo(6.25, 1);
    });

    it('должен извлекать topCategories из searchResults', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      const result = await service.getAssistance('entity-1');

      expect(result.relatedContext).toBeDefined();
      expect(result.relatedContext!.topCategories).toBeDefined();
      expect(result.relatedContext!.topCategories!.length).toBeGreaterThan(0);
    });

    it('должен генерировать рекомендации', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      const result = await service.getAssistance('entity-1');

      expect(result.suggestedActions).toBeDefined();
      expect(result.suggestedActions!.length).toBeGreaterThan(0);
      // Должна быть рекомендация назначить исполнителя (assigneeId = null)
      expect(result.suggestedActions!.some((a) => a.includes('Назначьте'))).toBe(true);
    });

    it('должен кэшировать результат', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      await service.getAssistance('entity-1');
      await service.getAssistance('entity-1');

      // searchSimilar вызван только один раз — второй раз из кэша
      expect(knowledgeBaseService.searchSimilar).toHaveBeenCalledTimes(1);
    });

    it('должен возвращать из кэша при повторном вызове', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      const result1 = await service.getAssistance('entity-1');
      const result2 = await service.getAssistance('entity-1');

      expect(result1).toEqual(result2);
    });

    it('должен обрабатывать ошибку поиска', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockRejectedValue(new Error('Search failed'));

      const result = await service.getAssistance('entity-1');

      expect(result.available).toBe(true);
      expect(result.similarCases).toEqual([]);
    });
  });

  describe('invalidateCache', () => {
    it('должен сбрасывать кэш для entity', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);

      await service.getAssistance('entity-1');
      service.invalidateCache('entity-1');
      await service.getAssistance('entity-1');

      // searchSimilar вызван дважды — кэш был сброшен
      expect(knowledgeBaseService.searchSimilar).toHaveBeenCalledTimes(2);
    });
  });

  describe('analyzeSentiment', () => {
    it('должен парсить JSON обёрнутый в markdown (YandexGPT)', async () => {
      const commentRepo = service['commentRepository'] as jest.Mocked<Repository<Comment>>;
      commentRepo.findOne.mockResolvedValue({
        id: 'comment-1',
        entityId: 'entity-1',
        content: 'Уже третий день станок стоит, мы теряем деньги! Когда будет решение?',
        createdAt: new Date(),
      } as unknown as Comment);

      providerRegistry.complete.mockResolvedValue({
        content: '```json\n{"label":"frustrated","score":0.9}\n```',
        inputTokens: 50,
        outputTokens: 20,
        model: 'yandexgpt-lite',
        provider: 'yandex',
      });

      const result = await service.analyzeSentiment('entity-1');

      expect(result).not.toBeNull();
      expect(result!.label).toBe('frustrated');
      expect(result!.emoji).toBe('😤');
      expect(result!.score).toBe(0.9);
    });

    it('должен парсить обычный JSON без обёртки', async () => {
      const commentRepo = service['commentRepository'] as jest.Mocked<Repository<Comment>>;
      commentRepo.findOne.mockResolvedValue({
        id: 'comment-1',
        entityId: 'entity-1',
        content: 'Спасибо, проблема решена, всё работает отлично!',
        createdAt: new Date(),
      } as unknown as Comment);

      providerRegistry.complete.mockResolvedValue({
        content: '{"label":"satisfied","score":0.95}',
        inputTokens: 50,
        outputTokens: 20,
        model: 'gpt-4o',
        provider: 'openai',
      });

      const result = await service.analyzeSentiment('entity-1');

      expect(result).not.toBeNull();
      expect(result!.label).toBe('satisfied');
      expect(result!.emoji).toBe('😊');
    });

    it('должен вернуть null если нет комментариев', async () => {
      const commentRepo = service['commentRepository'] as jest.Mocked<Repository<Comment>>;
      commentRepo.findOne.mockResolvedValue(null);

      const result = await service.analyzeSentiment('entity-1');

      expect(result).toBeNull();
    });

    it('должен вернуть null если AI недоступен', async () => {
      providerRegistry.isCompletionAvailable.mockReturnValue(false);

      const result = await service.analyzeSentiment('entity-1');

      expect(result).toBeNull();
    });

    it('должен кэшировать результат sentiment для того же комментария', async () => {
      const commentRepo = service['commentRepository'] as jest.Mocked<Repository<Comment>>;
      commentRepo.findOne.mockResolvedValue({
        id: 'comment-1',
        entityId: 'entity-1',
        content: 'Спасибо за быстрый ответ!',
        createdAt: new Date(),
      } as unknown as Comment);

      providerRegistry.complete.mockResolvedValue({
        content: '{"label":"satisfied","score":0.9}',
        inputTokens: 50,
        outputTokens: 20,
        model: 'gpt-4o',
        provider: 'openai',
      });

      await service.analyzeSentiment('entity-1');
      await service.analyzeSentiment('entity-1');

      // LLM вызван только один раз — второй раз из кэша
      expect(providerRegistry.complete).toHaveBeenCalledTimes(1);
    });

    it('должен пересчитать sentiment при новом комментарии', async () => {
      const commentRepo = service['commentRepository'] as jest.Mocked<Repository<Comment>>;

      // Первый вызов — comment-1
      commentRepo.findOne.mockResolvedValueOnce({
        id: 'comment-1',
        entityId: 'entity-1',
        content: 'Спасибо за быстрый ответ!',
        createdAt: new Date(),
      } as unknown as Comment);

      providerRegistry.complete.mockResolvedValue({
        content: '{"label":"satisfied","score":0.9}',
        inputTokens: 50,
        outputTokens: 20,
        model: 'gpt-4o',
        provider: 'openai',
      });

      await service.analyzeSentiment('entity-1');

      // Второй вызов — comment-2 (новый комментарий)
      commentRepo.findOne.mockResolvedValueOnce({
        id: 'comment-2',
        entityId: 'entity-1',
        content: 'Проблема снова повторилась!',
        createdAt: new Date(),
      } as unknown as Comment);

      await service.analyzeSentiment('entity-1');

      // LLM вызван дважды — разные commentId
      expect(providerRegistry.complete).toHaveBeenCalledTimes(2);
    });

    it('должен логировать usage при анализе sentiment', async () => {
      const commentRepo = service['commentRepository'] as jest.Mocked<Repository<Comment>>;
      commentRepo.findOne.mockResolvedValue({
        id: 'comment-1',
        entityId: 'entity-1',
        content: 'Проблема не решена уже неделю!',
        createdAt: new Date(),
      } as unknown as Comment);

      providerRegistry.complete.mockResolvedValue({
        content: '{"label":"frustrated","score":0.85}',
        inputTokens: 50,
        outputTokens: 20,
        model: 'gpt-4o',
        provider: 'openai',
      });

      await service.analyzeSentiment('entity-1');

      expect(usageLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'classify',
          success: true,
        }),
      );
      expect(usageLogRepo.save).toHaveBeenCalled();
    });
  });

  describe('generateResponseSuggestion', () => {
    it('должен генерировать черновик ответа', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);
      providerRegistry.complete.mockResolvedValue({
        content: 'Добрый день! Для решения проблемы с подшипником рекомендуем...',
        inputTokens: 500,
        outputTokens: 200,
        model: 'llama-3.1-70b',
        provider: 'groq',
      });

      const result = await service.generateResponseSuggestion('entity-1');

      expect(result.draft).toContain('подшипником');
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].similarity).toBe(0.92);
    });

    it('должен бросать ошибку если AI недоступен', async () => {
      providerRegistry.isCompletionAvailable.mockReturnValue(false);

      await expect(service.generateResponseSuggestion('entity-1')).rejects.toThrow(
        'AI провайдеры недоступны',
      );
    });

    it('должен бросать ошибку если entity не найден', async () => {
      entityRepo.findOne.mockResolvedValue(null);

      await expect(service.generateResponseSuggestion('entity-1')).rejects.toThrow(
        'Заявка не найдена',
      );
    });

    it('должен бросать ошибку если нет похожих случаев', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue([]);

      await expect(service.generateResponseSuggestion('entity-1')).rejects.toThrow(
        'Не найдено похожих случаев',
      );
    });

    it('должен логировать usage при генерации ответа', async () => {
      entityRepo.findOne.mockResolvedValue(mockEntity);
      knowledgeBaseService.searchSimilar.mockResolvedValue(mockSearchResults);
      providerRegistry.complete.mockResolvedValue({
        content: 'Рекомендуем проверить подшипник...',
        inputTokens: 500,
        outputTokens: 200,
        model: 'gpt-4o',
        provider: 'openai',
      });

      await service.generateResponseSuggestion('entity-1');

      expect(usageLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'generate',
          entityId: 'entity-1',
          success: true,
        }),
      );
      expect(usageLogRepo.save).toHaveBeenCalled();
    });
  });
});
