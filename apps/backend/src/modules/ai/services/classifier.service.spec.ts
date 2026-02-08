import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassifierService } from './classifier.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { AiClassification } from '../entities/ai-classification.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { ClassifyRequestDto } from '../dto/ai.dto';

describe('ClassifierService', () => {
  let service: ClassifierService;
  let providerRegistry: jest.Mocked<AiProviderRegistry>;
  let classificationRepo: jest.Mocked<Repository<AiClassification>>;
  let usageLogRepo: jest.Mocked<Repository<AiUsageLog>>;

  const mockClassificationResult = {
    content: JSON.stringify({
      category: 'technical_support',
      priority: 'high',
      skills: ['mechanical', 'electrical'],
      confidence: 0.92,
      reasoning: 'Проблема с двигателем станка требует срочного вмешательства',
    }),
    inputTokens: 150,
    outputTokens: 80,
    model: 'gpt-4o',
    provider: 'openai',
  };

  beforeEach(async () => {
    const mockProviderRegistry = {
      isCompletionAvailable: jest.fn().mockReturnValue(true),
      isEmbeddingAvailable: jest.fn().mockReturnValue(true),
      complete: jest.fn(),
      embed: jest.fn(),
    };

    const mockClassificationRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const mockUsageLogRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassifierService,
        {
          provide: AiProviderRegistry,
          useValue: mockProviderRegistry,
        },
        {
          provide: getRepositoryToken(AiClassification),
          useValue: mockClassificationRepo,
        },
        {
          provide: getRepositoryToken(AiUsageLog),
          useValue: mockUsageLogRepo,
        },
      ],
    }).compile();

    service = module.get<ClassifierService>(ClassifierService);
    providerRegistry = module.get(AiProviderRegistry);
    classificationRepo = module.get(getRepositoryToken(AiClassification));
    usageLogRepo = module.get(getRepositoryToken(AiUsageLog));
  });

  describe('isAvailable', () => {
    it('должен возвращать true если есть доступные провайдеры', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('должен возвращать false если нет доступных провайдеров', () => {
      providerRegistry.isCompletionAvailable.mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('classify', () => {
    const dto: ClassifyRequestDto = {
      title: 'Станок не запускается',
      description: 'При нажатии кнопки пуск двигатель не реагирует. Индикаторы горят.',
      equipment: 'Токарный станок СТ-500',
    };

    it('должен успешно классифицировать заявку', async () => {
      providerRegistry.complete.mockResolvedValue(mockClassificationResult);

      const result = await service.classify(dto, 'user-123');

      expect(result).toEqual({
        category: 'technical_support',
        priority: 'high',
        skills: ['mechanical', 'electrical'],
        confidence: 0.92,
        reasoning: 'Проблема с двигателем станка требует срочного вмешательства',
        provider: 'openai',
        model: 'gpt-4o',
      });

      expect(providerRegistry.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
          maxTokens: 500,
          jsonMode: true,
        }),
      );

      expect(usageLogRepo.create).toHaveBeenCalled();
      expect(usageLogRepo.save).toHaveBeenCalled();
    });

    it('должен выбросить ошибку если сервис не настроен', async () => {
      providerRegistry.isCompletionAvailable.mockReturnValue(false);

      await expect(service.classify(dto)).rejects.toThrow('AI сервис не настроен');
    });

    it('должен обработать некорректный JSON ответ', async () => {
      providerRegistry.complete.mockResolvedValue({
        ...mockClassificationResult,
        content: 'некорректный json',
      });

      const result = await service.classify(dto);

      expect(result).toMatchObject({
        category: 'other',
        priority: 'medium',
        skills: [],
        confidence: 0,
        reasoning: 'Ошибка парсинга ответа',
      });
    });

    it('должен логировать ошибки при сбое LLM', async () => {
      providerRegistry.complete.mockRejectedValue(new Error('API недоступен'));

      await expect(service.classify(dto)).rejects.toThrow('API недоступен');

      expect(usageLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'API недоступен',
        }),
      );
    });
  });

  describe('classifyAndSave', () => {
    const entityId = 'entity-123';
    const dto: ClassifyRequestDto = {
      title: 'Тестовая заявка',
      description: 'Описание проблемы',
    };

    it('должен создать новую классификацию', async () => {
      providerRegistry.complete.mockResolvedValue(mockClassificationResult);
      classificationRepo.findOne.mockResolvedValue(null);

      const newClassification = {
        id: 'class-123',
        entityId,
        category: 'technical_support',
        priority: 'high',
        skills: ['mechanical', 'electrical'],
        confidence: 0.92,
        reasoning: 'Проблема с двигателем',
        provider: 'openai',
        model: 'gpt-4o',
      };

      classificationRepo.create.mockReturnValue(newClassification as AiClassification);
      classificationRepo.save.mockResolvedValue(newClassification as AiClassification);

      const result = await service.classifyAndSave(entityId, dto);

      expect(classificationRepo.create).toHaveBeenCalled();
      expect(classificationRepo.save).toHaveBeenCalled();
      expect(result.entityId).toBe(entityId);
    });

    it('должен обновить существующую классификацию', async () => {
      providerRegistry.complete.mockResolvedValue(mockClassificationResult);

      const existingClassification = {
        id: 'class-123',
        entityId,
        category: 'other',
        priority: 'low',
        skills: [],
        confidence: 0.5,
      } as unknown as AiClassification;

      classificationRepo.findOne.mockResolvedValue(existingClassification);
      classificationRepo.save.mockImplementation((c) => Promise.resolve(c as AiClassification));

      const result = await service.classifyAndSave(entityId, dto);

      expect(classificationRepo.create).not.toHaveBeenCalled();
      expect(result.category).toBe('technical_support');
      expect(result.priority).toBe('high');
    });
  });

  describe('getClassification', () => {
    it('должен вернуть классификацию по entityId', async () => {
      const classification = {
        id: 'class-123',
        entityId: 'entity-123',
        category: 'technical_support',
      } as AiClassification;

      classificationRepo.findOne.mockResolvedValue(classification);

      const result = await service.getClassification('entity-123');

      expect(result).toBe(classification);
      expect(classificationRepo.findOne).toHaveBeenCalledWith({
        where: { entityId: 'entity-123' },
      });
    });

    it('должен вернуть null если классификация не найдена', async () => {
      classificationRepo.findOne.mockResolvedValue(null);

      const result = await service.getClassification('entity-123');

      expect(result).toBeNull();
    });
  });

  describe('applyClassification', () => {
    it('должен отметить классификацию как применённую', async () => {
      const classification = {
        id: 'class-123',
        entityId: 'entity-123',
        applied: false,
      } as AiClassification;

      classificationRepo.findOne.mockResolvedValue(classification);
      classificationRepo.save.mockImplementation((c) => Promise.resolve(c as AiClassification));

      const result = await service.applyClassification('entity-123', 'user-123');

      expect(result?.applied).toBe(true);
      expect(result?.appliedById).toBe('user-123');
      expect(result?.appliedAt).toBeInstanceOf(Date);
    });

    it('должен вернуть null если классификация не найдена', async () => {
      classificationRepo.findOne.mockResolvedValue(null);

      const result = await service.applyClassification('entity-123', 'user-123');

      expect(result).toBeNull();
    });
  });
});
