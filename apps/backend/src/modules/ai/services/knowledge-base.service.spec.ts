import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { KnowledgeChunk } from '../entities/knowledge-chunk.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let providerRegistry: jest.Mocked<AiProviderRegistry>;
  let chunkRepo: jest.Mocked<Repository<KnowledgeChunk>>;
  let usageLogRepo: jest.Mocked<Repository<AiUsageLog>>;
  let dataSource: jest.Mocked<DataSource>;

  const mockEmbedding = Array(1536).fill(0.1);
  const mockEmbeddingResult = {
    embedding: mockEmbedding,
    inputTokens: 50,
    model: 'text-embedding-3-large',
    provider: 'openai',
  };

  beforeEach(async () => {
    const mockProviderRegistry = {
      isEmbeddingAvailable: jest.fn().mockReturnValue(true),
      isCompletionAvailable: jest.fn().mockReturnValue(true),
      embed: jest.fn(),
      complete: jest.fn(),
    };

    const mockChunkRepo = {
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockUsageLogRepo = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn(),
    };

    const mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: AiProviderRegistry,
          useValue: mockProviderRegistry,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(KnowledgeChunk),
          useValue: mockChunkRepo,
        },
        {
          provide: getRepositoryToken(AiUsageLog),
          useValue: mockUsageLogRepo,
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    providerRegistry = module.get(AiProviderRegistry);
    dataSource = module.get(DataSource);
    chunkRepo = module.get(getRepositoryToken(KnowledgeChunk));
    usageLogRepo = module.get(getRepositoryToken(AiUsageLog));
  });

  describe('isAvailable', () => {
    it('должен возвращать true если есть доступные провайдеры для embeddings', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('должен возвращать false если нет доступных провайдеров', () => {
      providerRegistry.isEmbeddingAvailable.mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('addChunk', () => {
    it('должен добавить чанк с embedding', async () => {
      providerRegistry.embed.mockResolvedValue(mockEmbeddingResult);

      const newChunk = {
        id: 'chunk-123',
        content: 'Тестовый контент',
        embedding: mockEmbedding,
        sourceType: 'entity',
        sourceId: 'entity-123',
        workspaceId: 'ws-123',
        metadata: { title: 'Тест' },
      } as unknown as KnowledgeChunk;

      chunkRepo.create.mockReturnValue(newChunk);
      chunkRepo.save.mockResolvedValue(newChunk);

      const result = await service.addChunk({
        content: 'Тестовый контент',
        sourceType: 'entity',
        sourceId: 'entity-123',
        workspaceId: 'ws-123',
        metadata: { title: 'Тест' },
      });

      expect(providerRegistry.embed).toHaveBeenCalledWith('Тестовый контент');
      expect(chunkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Тестовый контент',
          embedding: mockEmbedding,
          sourceType: 'entity',
        }),
      );
      expect(result.id).toBe('chunk-123');
    });

    it('должен выбросить ошибку если сервис не настроен', async () => {
      providerRegistry.isEmbeddingAvailable.mockReturnValue(false);

      await expect(
        service.addChunk({
          content: 'Тест',
          sourceType: 'entity',
        }),
      ).rejects.toThrow('AI сервис не настроен');
    });

    it('должен логировать использование API с провайдером', async () => {
      providerRegistry.embed.mockResolvedValue(mockEmbeddingResult);
      chunkRepo.create.mockReturnValue({ id: 'chunk-123' } as KnowledgeChunk);
      chunkRepo.save.mockResolvedValue({ id: 'chunk-123' } as KnowledgeChunk);

      await service.addChunk({
        content: 'Тест',
        sourceType: 'entity',
        workspaceId: 'ws-123',
      });

      expect(usageLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          operation: 'embed',
          workspaceId: 'ws-123',
          inputTokens: 50,
          success: true,
        }),
      );
    });

    it('должен использовать разные провайдеры (Ollama)', async () => {
      providerRegistry.embed.mockResolvedValue({
        ...mockEmbeddingResult,
        provider: 'ollama',
        model: 'nomic-embed-text',
      });
      chunkRepo.create.mockReturnValue({ id: 'chunk-123' } as KnowledgeChunk);
      chunkRepo.save.mockResolvedValue({ id: 'chunk-123' } as KnowledgeChunk);

      await service.addChunk({
        content: 'Тест',
        sourceType: 'entity',
      });

      expect(usageLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'ollama',
          model: 'nomic-embed-text',
        }),
      );
    });
  });

  describe('removeChunksBySource', () => {
    it('должен удалить чанки по sourceType и sourceId', async () => {
      chunkRepo.delete.mockResolvedValue({ affected: 3, raw: [] });

      const result = await service.removeChunksBySource('entity', 'entity-123');

      expect(result).toBe(3);
      expect(chunkRepo.delete).toHaveBeenCalledWith({
        sourceType: 'entity',
        sourceId: 'entity-123',
      });
    });

    it('должен вернуть 0 если ничего не удалено', async () => {
      chunkRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      const result = await service.removeChunksBySource('entity', 'nonexistent');

      expect(result).toBe(0);
    });
  });

  describe('getIndexedSourceIds', () => {
    it('должен вернуть Set проиндексированных sourceId', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { sourceId: '100' },
          { sourceId: '200' },
        ]),
      };

      chunkRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as never);

      const result = await service.getIndexedSourceIds('legacy_request', ['100', '200', '300']);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('100')).toBe(true);
      expect(result.has('200')).toBe(true);
      expect(result.has('300')).toBe(false);
    });

    it('должен вернуть пустой Set для пустого массива', async () => {
      const result = await service.getIndexedSourceIds('legacy_request', []);

      expect(result.size).toBe(0);
      expect(chunkRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('searchSimilar', () => {
    it('должен найти похожие чанки', async () => {
      providerRegistry.embed.mockResolvedValue(mockEmbeddingResult);

      const similarChunks = [
        {
          id: 'chunk-1',
          content: 'Похожий контент 1',
          sourceType: 'entity',
          sourceId: 'entity-1',
          metadata: {},
          similarity: 0.95,
        },
        {
          id: 'chunk-2',
          content: 'Похожий контент 2',
          sourceType: 'entity',
          sourceId: 'entity-2',
          metadata: {},
          similarity: 0.88,
        },
      ];

      dataSource.query.mockResolvedValue(similarChunks);

      const result = await service.searchSimilar({
        query: 'Поиск',
        workspaceId: 'ws-123',
        limit: 10,
        minSimilarity: 0.7,
      });

      expect(result).toHaveLength(2);
      expect(result[0].similarity).toBe(0.95);
      expect(providerRegistry.embed).toHaveBeenCalledWith('Поиск');
      expect(dataSource.query).toHaveBeenCalled();
    });

    it('должен выбросить ошибку если сервис не настроен', async () => {
      providerRegistry.isEmbeddingAvailable.mockReturnValue(false);

      await expect(
        service.searchSimilar({ query: 'Тест' }),
      ).rejects.toThrow('AI сервис не настроен');
    });

    it('должен использовать значения по умолчанию', async () => {
      providerRegistry.embed.mockResolvedValue(mockEmbeddingResult);
      dataSource.query.mockResolvedValue([]);

      await service.searchSimilar({ query: 'Тест' });

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String), // embedding vector
          null, // workspaceId
          null, // sourceType
          10, // limit (default)
          0.7, // minSimilarity (default)
        ]),
      );
    });
  });

  describe('getStats', () => {
    it('должен вернуть статистику базы знаний', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(100),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { sourceType: 'entity', count: '60' },
          { sourceType: 'comment', count: '30' },
          { sourceType: 'faq', count: '10' },
        ]),
      };

      chunkRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as never);

      const result = await service.getStats('ws-123');

      expect(result.totalChunks).toBe(100);
      expect(result.bySourceType).toEqual({
        entity: 60,
        comment: 30,
        faq: 10,
      });
    });

    it('должен работать без фильтра по workspace', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(50),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      chunkRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as never);

      const result = await service.getStats();

      expect(result.totalChunks).toBe(50);
      expect(result.bySourceType).toEqual({});
    });
  });
});
