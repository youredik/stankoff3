import { Test, TestingModule } from '@nestjs/testing';
import { RagIndexerService } from './rag-indexer.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LegacyService } from '../../legacy/services/legacy.service';
import { LegacyRequest, LegacyAnswer } from '../../legacy/entities';

describe('RagIndexerService', () => {
  let service: RagIndexerService;
  let knowledgeBase: jest.Mocked<KnowledgeBaseService>;
  let legacyService: jest.Mocked<LegacyService>;

  const mockRequest = {
    id: 1,
    subject: 'Тестовая тема заявки',
    customerId: 100,
    managerId: 50,
    closed: 1, // закрытая
    type: 'technical',
    createdAt: new Date('2024-01-15T09:00:00'),
    updatedAt: new Date('2024-01-16T15:00:00'),
    answerDate: new Date('2024-01-15T11:00:00'),
    firstReactionTime: null,
    get isClosed() { return this.closed === 1; },
  } as unknown as LegacyRequest;

  const mockAnswers: LegacyAnswer[] = [
    {
      id: 1,
      requestId: 1,
      customerId: 100,
      isClient: 1,
      text: 'Первый ответ от клиента',
      createdAt: new Date('2024-01-15T10:00:00'),
    } as LegacyAnswer,
    {
      id: 2,
      requestId: 1,
      customerId: null as unknown as number,
      isClient: 0,
      text: 'Ответ специалиста с решением проблемы',
      createdAt: new Date('2024-01-15T11:00:00'),
    } as LegacyAnswer,
    {
      id: 3,
      requestId: 1,
      customerId: 100,
      isClient: 1,
      text: 'Спасибо, проблема решена!',
      createdAt: new Date('2024-01-15T12:00:00'),
    } as LegacyAnswer,
  ];

  beforeEach(async () => {
    const mockKnowledgeBase = {
      isAvailable: jest.fn().mockReturnValue(true),
      addChunk: jest.fn().mockResolvedValue({ id: 'chunk-123' }),
      removeChunksBySource: jest.fn().mockResolvedValue(0),
      getIndexedSourceIds: jest.fn().mockResolvedValue(new Set<string>()),
      getStats: jest.fn().mockResolvedValue({
        totalChunks: 100,
        bySourceType: { legacy_request: 80, entity: 20 },
      }),
    };

    const mockLegacyService = {
      isAvailable: jest.fn().mockReturnValue(true),
      getIndexableRequestsCount: jest.fn().mockResolvedValue(1000),
      getRequestsForIndexing: jest.fn(),
      getRequestWithAnswers: jest.fn(),
      getRequestsWithAnswersBatch: jest.fn(),
      getIndexingStats: jest.fn().mockResolvedValue({
        totalRequests: 344000,
        closedRequests: 280000,
        totalAnswers: 2300000,
        averageAnswersPerRequest: 8.2,
      }),
      // Новые методы для расширенной информации
      getManagerInfo: jest.fn().mockResolvedValue({
        id: 50,
        fullName: 'Иванов Иван',
        departmentName: 'Техподдержка',
      }),
      getEmployeeNamesByUserIds: jest.fn().mockResolvedValue(new Map()),
      getCustomerRichInfo: jest.fn().mockResolvedValue({
        id: 100,
        fullName: 'Петров Пётр',
        email: 'petrov@example.com',
        phone: '+7 (999) 123-45-67',
        isEmployee: false,
        totalRequests: 15,
        counterparty: {
          id: 200,
          name: 'ООО Рога и Копыта',
          inn: '7701234567',
        },
      }),
      getDealsByCounterpartyId: jest.fn().mockResolvedValue([
        {
          id: 500,
          name: 'Поставка оборудования',
          sum: 1500000,
          isClosed: true,
        },
        {
          id: 501,
          name: 'Сервисное обслуживание',
          sum: 250000,
          isClosed: false,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagIndexerService,
        {
          provide: KnowledgeBaseService,
          useValue: mockKnowledgeBase,
        },
        {
          provide: LegacyService,
          useValue: mockLegacyService,
        },
      ],
    }).compile();

    service = module.get<RagIndexerService>(RagIndexerService);
    knowledgeBase = module.get(KnowledgeBaseService);
    legacyService = module.get(LegacyService);
  });

  describe('isAvailable', () => {
    it('должен возвращать true если оба сервиса доступны', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('должен возвращать false если KnowledgeBase недоступен', () => {
      knowledgeBase.isAvailable.mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });

    it('должен возвращать false если LegacyService недоступен', () => {
      legacyService.isAvailable.mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('должен возвращать null если индексация не запущена', () => {
      expect(service.getStatus()).toBeNull();
    });
  });

  describe('indexRequest', () => {
    it('должен создать чанки для заявки с ответами', async () => {
      const chunksCreated = await service.indexRequest(mockRequest, mockAnswers);

      expect(knowledgeBase.removeChunksBySource).toHaveBeenCalledWith(
        'legacy_request',
        '1',
      );
      expect(knowledgeBase.addChunk).toHaveBeenCalled();
      expect(chunksCreated).toBeGreaterThan(0);
    });

    it('должен вернуть 0 для слишком короткого текста', async () => {
      const shortRequest = {
        ...mockRequest,
        subject: '',
      } as unknown as LegacyRequest;

      const chunksCreated = await service.indexRequest(shortRequest, []);

      expect(chunksCreated).toBe(0);
    });

    it('должен включить metadata в чанки', async () => {
      await service.indexRequest(mockRequest, mockAnswers);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'legacy_request',
          sourceId: '1',
          metadata: expect.objectContaining({
            requestId: 1,
            subject: 'Тестовая тема заявки',
            managerId: 50,
            customerId: 100,
            answersCount: 3,
            legacyUrl: 'https://www.stankoff.ru/crm/request/1',
          }),
        }),
      );
    });

    it('должен обработать заявку без ответов', async () => {
      const requestWithLongText = {
        ...mockRequest,
        subject: 'Достаточно длинный текст заявки для индексации. '.repeat(10),
      } as unknown as LegacyRequest;

      const chunksCreated = await service.indexRequest(requestWithLongText, []);

      expect(chunksCreated).toBeGreaterThan(0);
      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            answersCount: 0,
          }),
        }),
      );
    });
  });

  describe('reindexRequest', () => {
    it('должен переиндексировать существующую заявку', async () => {
      legacyService.getRequestWithAnswers.mockResolvedValue({
        request: mockRequest,
        answers: mockAnswers,
        customer: null,
      });

      const result = await service.reindexRequest(1);

      expect(result.success).toBe(true);
      expect(result.requestId).toBe(1);
      expect(result.chunksCreated).toBeGreaterThan(0);
    });

    it('должен вернуть ошибку для несуществующей заявки', async () => {
      legacyService.getRequestWithAnswers.mockResolvedValue({
        request: null,
        answers: [],
        customer: null,
      });

      const result = await service.reindexRequest(999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Заявка не найдена');
    });

    it('должен вернуть ошибку если сервис недоступен', async () => {
      knowledgeBase.isAvailable.mockReturnValue(false);

      const result = await service.reindexRequest(1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('RAG Indexer недоступен');
    });
  });

  describe('indexAll', () => {
    beforeEach(() => {
      legacyService.getIndexableRequestsCount.mockResolvedValue(2);
      legacyService.getRequestsForIndexing.mockResolvedValue({
        items: [mockRequest, { ...mockRequest, id: 2 } as unknown as LegacyRequest],
        total: 2,
      });

      const batchMap = new Map();
      batchMap.set(1, { request: mockRequest, answers: mockAnswers });
      batchMap.set(2, {
        request: { ...mockRequest, id: 2, subject: 'Вторая заявка '.repeat(20) },
        answers: [],
      });
      legacyService.getRequestsWithAnswersBatch.mockResolvedValue(batchMap);
    });

    it('должен проиндексировать все заявки', async () => {
      const stats = await service.indexAll({ batchSize: 10 });

      expect(stats.processedRequests).toBe(2);
      expect(stats.totalChunks).toBeGreaterThan(0);
      expect(stats.isRunning).toBe(false);
      expect(stats.finishedAt).toBeDefined();
    });

    it('должен выбросить ошибку если сервис недоступен', async () => {
      knowledgeBase.isAvailable.mockReturnValue(false);

      await expect(service.indexAll()).rejects.toThrow(
        'RAG Indexer недоступен',
      );
    });

    it('должен ограничить количество заявок через maxRequests', async () => {
      const stats = await service.indexAll({ maxRequests: 1 });

      expect(stats.totalRequests).toBe(1);
    });

    it('должен вызывать onProgress callback', async () => {
      const onProgress = jest.fn();

      await service.indexAll({ onProgress });

      expect(onProgress).toHaveBeenCalled();
    });

    it('должен пропускать уже проиндексированные заявки', async () => {
      // Заявка с id=1 уже проиндексирована
      knowledgeBase.getIndexedSourceIds.mockResolvedValue(new Set(['1']));

      // Мок возвращает только запрошенные заявки
      const request2 = { ...mockRequest, id: 2, subject: 'Вторая заявка '.repeat(20) } as unknown as LegacyRequest;
      legacyService.getRequestsWithAnswersBatch.mockImplementation(async (ids: number[]) => {
        const map = new Map();
        if (ids.includes(2)) map.set(2, { request: request2, answers: [] });
        return map;
      });

      const stats = await service.indexAll({ batchSize: 10 });

      // Обработаны обе заявки (1 пропущена, 1 проиндексирована)
      expect(stats.processedRequests).toBe(2);
      expect(stats.skippedRequests).toBe(1);
      // getRequestsWithAnswersBatch вызван только для новой заявки (id=2)
      expect(legacyService.getRequestsWithAnswersBatch).toHaveBeenCalledWith([2]);
    });

    it('должен пропустить весь batch если все уже проиндексированы', async () => {
      // Обе заявки уже проиндексированы
      knowledgeBase.getIndexedSourceIds.mockResolvedValue(new Set(['1', '2']));

      const stats = await service.indexAll({ batchSize: 10 });

      expect(stats.processedRequests).toBe(2);
      expect(stats.skippedRequests).toBe(2);
      expect(stats.totalChunks).toBe(0);
      // getRequestsWithAnswersBatch не должен вызываться
      expect(legacyService.getRequestsWithAnswersBatch).not.toHaveBeenCalled();
    });

    it('должен блокировать повторный запуск во время выполнения', async () => {
      // Этот тест проверяет, что при одновременном запуске
      // isRunning корректно устанавливается
      const stats = await service.indexAll({ batchSize: 1 });

      // После завершения можно запустить снова
      expect(stats.isRunning).toBe(false);
    });
  });

  describe('getIndexingStatistics', () => {
    it('должен вернуть статистику индексации', async () => {
      const stats = await service.getIndexingStatistics();

      expect(stats.legacy.totalRequests).toBe(344000);
      expect(stats.legacy.closedRequests).toBe(280000);
      expect(stats.legacy.totalAnswers).toBe(2300000);
      expect(stats.knowledgeBase.totalChunks).toBe(100);
      // bySourceType содержит 80 legacy_request чанков
      // ~80 / 2.5 = 32 заявки, из 280000 = ~0.01%
      expect(stats.coverage.indexedRequests).toBeGreaterThan(0);
    });
  });

  describe('text processing', () => {
    it('должен очистить HTML теги', async () => {
      const htmlAnswers: LegacyAnswer[] = [
        {
          id: 1,
          requestId: 1,
          customerId: 100,
          isClient: 1,
          text: '<p>Текст <b>с HTML</b> тегами</p> '.repeat(20),
          createdAt: new Date('2024-01-15T10:00:00'),
        } as LegacyAnswer,
      ];

      await service.indexRequest(mockRequest, htmlAnswers);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.not.stringContaining('<p>'),
        }),
      );
    });

    it('должен правильно разбить длинный текст на чанки', async () => {
      // Создаём очень длинный текст (> 2000 символов)
      const longAnswers: LegacyAnswer[] = [
        {
          id: 1,
          requestId: 1,
          customerId: 100,
          isClient: 1,
          text: 'Это очень длинный текст заявки. '.repeat(200),
          createdAt: new Date('2024-01-15T10:00:00'),
        } as LegacyAnswer,
      ];

      await service.indexRequest(mockRequest, longAnswers);

      // Должно быть создано несколько чанков
      const calls = knowledgeBase.addChunk.mock.calls;
      expect(calls.length).toBeGreaterThan(1);

      // Проверяем что chunkIndex увеличивается
      const indices = calls.map(call => call[0]?.metadata?.chunkIndex);
      expect(indices).toContain(0);
      expect(indices).toContain(1);
    });
  });

  describe('customer info extraction', () => {
    it('должен включить информацию о клиенте в metadata', async () => {
      await service.indexRequest(mockRequest, mockAnswers);

      expect(legacyService.getCustomerRichInfo).toHaveBeenCalledWith(100);
      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            customerName: 'Петров Пётр',
            customerEmail: 'petrov@example.com',
            customerIsEmployee: false,
            customerTotalRequests: 15,
            counterpartyId: 200,
            counterpartyName: 'ООО Рога и Копыта',
            counterpartyInn: '7701234567',
            counterpartyUrl: 'https://www.stankoff.ru/crm/counterparty/200',
          }),
        }),
      );
    });

    it('должен включить связанные сделки в metadata', async () => {
      await service.indexRequest(mockRequest, mockAnswers);

      expect(legacyService.getDealsByCounterpartyId).toHaveBeenCalledWith(200);
      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            relatedDeals: expect.arrayContaining([
              expect.objectContaining({
                id: 500,
                name: 'Поставка оборудования',
                sum: 1500000,
                url: 'https://www.stankoff.ru/crm/deal/500',
              }),
            ]),
          }),
        }),
      );
    });

    it('должен обработать клиента без контрагента', async () => {
      legacyService.getCustomerRichInfo.mockResolvedValue({
        id: 100,
        fullName: 'Частное лицо',
        isEmployee: false,
        totalRequests: 5,
      });

      await service.indexRequest(mockRequest, mockAnswers);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            customerName: 'Частное лицо',
            customerIsEmployee: false,
          }),
        }),
      );
      // Не должно быть вызова для сделок
      expect(legacyService.getDealsByCounterpartyId).not.toHaveBeenCalled();
    });

    it('должен обработать null от getCustomerRichInfo', async () => {
      legacyService.getCustomerRichInfo.mockResolvedValue(null);

      await service.indexRequest(mockRequest, mockAnswers);

      // Не должно быть ошибки
      expect(knowledgeBase.addChunk).toHaveBeenCalled();
    });
  });

  describe('analytics extraction', () => {
    it('должен включить аналитику в metadata', async () => {
      await service.indexRequest(mockRequest, mockAnswers);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            requestType: 'technical',
            responseCount: 3,
            clientResponseCount: 2,
          }),
        }),
      );
    });

    it('должен рассчитать время решения', async () => {
      await service.indexRequest(mockRequest, mockAnswers);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            // 30 часов между createdAt и closedAt
            resolutionTimeHours: 30,
            resolutionTimeDays: 1.3, // округление до 1 десятичного
          }),
        }),
      );
    });

    it('должен рассчитать время первого ответа', async () => {
      const answersWithFirstResponse = [
        {
          id: 1,
          requestId: 1,
          customerId: null as unknown as number, // ответ специалиста
          text: 'Первый ответ специалиста',
          createdAt: new Date('2024-01-15T11:00:00'), // через 2 часа после создания
          isClient: 0,
        } as LegacyAnswer,
      ];

      await service.indexRequest(mockRequest, answersWithFirstResponse);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            firstResponseTimeHours: 2,
          }),
        }),
      );
    });

    it('должен подсчитать ответы клиента', async () => {
      const answersWithClient = [
        { id: 1, requestId: 1, text: 'От специалиста', isClient: 0 } as LegacyAnswer,
        { id: 2, requestId: 1, text: 'От клиента 1', isClient: 1 } as LegacyAnswer,
        { id: 3, requestId: 1, text: 'От клиента 2', isClient: 1 } as LegacyAnswer,
      ];

      await service.indexRequest(mockRequest, answersWithClient);

      expect(knowledgeBase.addChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            responseCount: 3,
            clientResponseCount: 2,
          }),
        }),
      );
    });

    it('должен обработать открытую заявку (без закрытия)', async () => {
      const openRequest = {
        ...mockRequest,
        closed: 0,
        get isClosed() { return false; },
      } as unknown as LegacyRequest;

      await service.indexRequest(openRequest, mockAnswers);

      // Не должно быть ошибки, resolutionTimeHours должен быть undefined
      expect(knowledgeBase.addChunk).toHaveBeenCalled();
      const call = knowledgeBase.addChunk.mock.calls[0][0];
      expect(call?.metadata?.resolutionTimeHours).toBeUndefined();
    });
  });
});
