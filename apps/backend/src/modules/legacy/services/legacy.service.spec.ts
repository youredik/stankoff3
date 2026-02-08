import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { LegacyService } from './legacy.service';
import { LEGACY_DATA_SOURCE } from '../legacy-database.config';
import {
  LegacyCustomer,
  LegacyProduct,
  LegacyCategory,
  LegacyCounterparty,
  LegacyDeal,
  LegacyDealStage,
  LegacyRequest,
  LegacyAnswer,
  LegacyManager,
  LegacyDepartment,
} from '../entities';

describe('LegacyService', () => {
  let service: LegacyService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockCustomerRepository: jest.Mocked<Repository<LegacyCustomer>>;
  let mockProductRepository: jest.Mocked<Repository<LegacyProduct>>;
  let mockCategoryRepository: jest.Mocked<Repository<LegacyCategory>>;
  let mockCounterpartyRepository: jest.Mocked<Repository<LegacyCounterparty>>;
  let mockDealRepository: jest.Mocked<Repository<LegacyDeal>>;
  let mockDealStageRepository: jest.Mocked<Repository<LegacyDealStage>>;
  let mockRequestRepository: jest.Mocked<Repository<LegacyRequest>>;
  let mockAnswerRepository: jest.Mocked<Repository<LegacyAnswer>>;
  let mockManagerRepository: jest.Mocked<Repository<LegacyManager>>;
  let mockDepartmentRepository: jest.Mocked<Repository<LegacyDepartment>>;

  const createMockQueryBuilder = () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    };
    return qb as unknown as SelectQueryBuilder<any>;
  };

  beforeEach(async () => {
    // Создаём моки репозиториев
    mockCustomerRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyCustomer>>;

    mockProductRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyProduct>>;

    mockCategoryRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyCategory>>;

    mockCounterpartyRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyCounterparty>>;

    mockDealRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyDeal>>;

    mockDealStageRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyDealStage>>;

    mockRequestRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    } as unknown as jest.Mocked<Repository<LegacyRequest>>;

    mockAnswerRepository = {
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    } as unknown as jest.Mocked<Repository<LegacyAnswer>>;

    mockManagerRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    } as unknown as jest.Mocked<Repository<LegacyManager>>;

    mockDepartmentRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<LegacyDepartment>>;

    // Создаём мок DataSource
    mockDataSource = {
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((entity) => {
        if (entity === LegacyCustomer) return mockCustomerRepository;
        if (entity === LegacyProduct) return mockProductRepository;
        if (entity === LegacyCategory) return mockCategoryRepository;
        if (entity === LegacyCounterparty) return mockCounterpartyRepository;
        if (entity === LegacyDeal) return mockDealRepository;
        if (entity === LegacyDealStage) return mockDealStageRepository;
        if (entity === LegacyRequest) return mockRequestRepository;
        if (entity === LegacyAnswer) return mockAnswerRepository;
        if (entity === LegacyManager) return mockManagerRepository;
        if (entity === LegacyDepartment) return mockDepartmentRepository;
        return null;
      }),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegacyService,
        {
          provide: LEGACY_DATA_SOURCE,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<LegacyService>(LegacyService);
    // Инициализируем сервис
    await service.onModuleInit();
  });

  describe('isAvailable', () => {
    it('должен вернуть true когда DataSource инициализирован', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('должен вернуть false когда DataSource не инициализирован', async () => {
      const unavailableDataSource = {
        isInitialized: false,
        initialize: jest.fn().mockRejectedValue(new Error('Connection failed')),
        getRepository: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          {
            provide: LEGACY_DATA_SOURCE,
            useValue: unavailableDataSource,
          },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      expect(testService.isAvailable()).toBe(false);
    });
  });

  describe('searchCustomers', () => {
    it('должен вернуть пустой результат если БД недоступна', async () => {
      // Создаём сервис с недоступной БД
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          {
            provide: LEGACY_DATA_SOURCE,
            useValue: unavailableDataSource,
          },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.searchCustomers('test');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('должен искать клиентов по query', async () => {
      const mockCustomer: Partial<LegacyCustomer> = {
        id: 1,
        firstName: 'Иван',
        lastName: 'Иванов',
        email: 'ivan@test.ru',
        phone: '79001234567',
        isManager: 0,
        defaultCounterpartyId: 0,
      };

      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([[mockCustomer], 1]);
      (mockCustomerRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.searchCustomers('Иван', { limit: 10, offset: 0 });

      expect(mockCustomerRepository.createQueryBuilder).toHaveBeenCalledWith('customer');
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].firstName).toBe('Иван');
    });

    it('должен фильтровать только сотрудников если employeesOnly=true', async () => {
      const queryBuilder = createMockQueryBuilder();
      (mockCustomerRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await service.searchCustomers('test', { employeesOnly: true });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'customer.is_manager = :isManager',
        { isManager: 1 },
      );
    });
  });

  describe('getCustomerById', () => {
    it('должен вернуть null если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          {
            provide: LEGACY_DATA_SOURCE,
            useValue: unavailableDataSource,
          },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getCustomerById(1);

      expect(result).toBeNull();
    });

    it('должен вернуть клиента по ID', async () => {
      const mockCustomer: Partial<LegacyCustomer> = {
        id: 1,
        firstName: 'Иван',
        lastName: 'Иванов',
        email: 'ivan@test.ru',
      };

      mockCustomerRepository.findOne.mockResolvedValue(mockCustomer as LegacyCustomer);

      const result = await service.getCustomerById(1);

      expect(mockCustomerRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
    });

    it('должен вернуть null если клиент не найден', async () => {
      mockCustomerRepository.findOne.mockResolvedValue(null);

      const result = await service.getCustomerById(999);

      expect(result).toBeNull();
    });
  });

  describe('searchProducts', () => {
    it('должен искать товары с учётом категории', async () => {
      const mockProduct: Partial<LegacyProduct> = {
        id: 1,
        name: 'Станок XYZ',
        categoryId: 5,
        enabled: 1,
      };

      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([[mockProduct], 1]);
      (mockProductRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      mockCategoryRepository.find.mockResolvedValue([]);

      await service.searchProducts('Станок', { categoryId: 5 });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'product.categoryID = :categoryId',
        { categoryId: 5 },
      );
    });

    it('должен фильтровать только товары в наличии если inStockOnly=true', async () => {
      const queryBuilder = createMockQueryBuilder();
      (mockProductRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      mockCategoryRepository.find.mockResolvedValue([]);

      await service.searchProducts('test', { inStockOnly: true });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.in_stock > 0');
    });
  });

  describe('getProductById', () => {
    it('должен вернуть товар с категорией', async () => {
      const mockProduct: Partial<LegacyProduct> = {
        id: 1,
        name: 'Станок XYZ',
        categoryId: 5,
        enabled: 1,
      };
      const mockCategory: Partial<LegacyCategory> = {
        id: 5,
        name: 'Токарные станки',
      };

      mockProductRepository.findOne.mockResolvedValue(mockProduct as LegacyProduct);
      mockCategoryRepository.findOne.mockResolvedValue(mockCategory as LegacyCategory);

      const result = await service.getProductById(1);

      expect(result).not.toBeNull();
      expect(result?.categoryName).toBe('Токарные станки');
    });
  });

  describe('getCategories', () => {
    it('должен вернуть все активные категории', async () => {
      const mockCategories: Partial<LegacyCategory>[] = [
        { id: 1, name: 'Токарные станки', isActive: 1 },
        { id: 2, name: 'Фрезерные станки', isActive: 1 },
      ];

      mockCategoryRepository.find.mockResolvedValue(mockCategories as LegacyCategory[]);

      const result = await service.getCategories();

      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: { isActive: 1 },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      expect(result.length).toBe(2);
    });
  });

  describe('searchCounterparties', () => {
    it('должен искать контрагентов по названию или ИНН', async () => {
      const mockCounterparty: Partial<LegacyCounterparty> = {
        id: 1,
        name: 'ООО "Тест"',
        inn: '1234567890',
      };

      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([[mockCounterparty], 1]);
      (mockCounterpartyRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.searchCounterparties('Тест');

      expect(result.total).toBe(1);
      expect(result.items[0].name).toBe('ООО "Тест"');
    });
  });

  describe('searchDeals', () => {
    it('должен искать сделки по контрагенту', async () => {
      const mockDeal: Partial<LegacyDeal> = {
        id: 1,
        counterpartyId: 5,
        sum: 100000,
        dealStageId: 2,
      };

      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([[mockDeal], 1]);
      (mockDealRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      mockDealStageRepository.find.mockResolvedValue([]);
      mockCounterpartyRepository.find.mockResolvedValue([]);

      await service.searchDeals({ counterpartyId: 5 });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'deal.counterparty_id = :counterpartyId',
        { counterpartyId: 5 },
      );
    });
  });

  describe('getDealById', () => {
    it('должен вернуть сделку с этапом и контрагентом', async () => {
      const mockDeal: Partial<LegacyDeal> = {
        id: 1,
        counterpartyId: 5,
        dealStageId: 2,
        sum: 100000,
      };
      const mockStage: Partial<LegacyDealStage> = {
        id: 2,
        name: 'Переговоры',
        color: '#FF0000',
      };
      const mockCounterparty: Partial<LegacyCounterparty> = {
        id: 5,
        name: 'ООО "Клиент"',
      };

      mockDealRepository.findOne.mockResolvedValue(mockDeal as LegacyDeal);
      mockDealStageRepository.findOne.mockResolvedValue(mockStage as LegacyDealStage);
      mockCounterpartyRepository.findOne.mockResolvedValue(mockCounterparty as LegacyCounterparty);

      const result = await service.getDealById(1);

      expect(result).not.toBeNull();
      expect(result?.stageName).toBe('Переговоры');
      expect(result?.counterpartyName).toBe('ООО "Клиент"');
    });
  });

  describe('getRequestsByCustomerId', () => {
    it('должен вернуть обращения клиента', async () => {
      const mockRequests: Partial<LegacyRequest>[] = [
        { id: 1, customerId: 5, subject: 'Проблема с оборудованием' },
        { id: 2, customerId: 5, subject: 'Вопрос по настройке' },
      ];

      mockRequestRepository.find.mockResolvedValue(mockRequests as LegacyRequest[]);

      const result = await service.getRequestsByCustomerId(5);

      expect(mockRequestRepository.find).toHaveBeenCalledWith({
        where: { customerId: 5 },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result.length).toBe(2);
    });
  });

  // ==================== RAG INDEXING TESTS ====================

  describe('getRequestsForIndexing', () => {
    it('должен вернуть пустой результат если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getRequestsForIndexing();

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('должен вернуть закрытые заявки для индексации', async () => {
      const mockRequests: Partial<LegacyRequest>[] = [
        { id: 1, closed: 1, body: 'Текст заявки 1', customerId: 100 },
        { id: 2, closed: 1, body: 'Текст заявки 2', customerId: 101 },
      ];

      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([mockRequests, 2]);
      (mockRequestRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.getRequestsForIndexing({ limit: 10, offset: 0 });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(queryBuilder.where).toHaveBeenCalledWith('request.closed = :closed', { closed: 1 });
    });

    it('должен фильтровать по дате модификации', async () => {
      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([[], 0]);
      (mockRequestRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const modifiedAfter = new Date('2024-01-01');
      await service.getRequestsForIndexing({ modifiedAfter });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'request.add_date > :modifiedAfter',
        { modifiedAfter },
      );
    });
  });

  describe('getIndexableRequestsCount', () => {
    it('должен вернуть 0 если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getIndexableRequestsCount();

      expect(result).toBe(0);
    });

    it('должен вернуть количество закрытых заявок', async () => {
      const queryBuilder = {
        ...createMockQueryBuilder(),
        getCount: jest.fn().mockResolvedValue(280000),
      };
      (mockRequestRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.getIndexableRequestsCount();

      expect(result).toBe(280000);
    });
  });

  describe('getAnswersByRequestId', () => {
    it('должен вернуть пустой массив если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getAnswersByRequestId(1);

      expect(result).toEqual([]);
    });

    it('должен вернуть ответы для заявки', async () => {
      const mockAnswers: Partial<LegacyAnswer>[] = [
        { id: 1, requestId: 1, answer: 'Ответ 1', customerId: 100 },
        { id: 2, requestId: 1, answer: 'Ответ 2', customerId: null as unknown as number },
      ];

      mockAnswerRepository.find.mockResolvedValue(mockAnswers as LegacyAnswer[]);

      const result = await service.getAnswersByRequestId(1);

      expect(mockAnswerRepository.find).toHaveBeenCalledWith({
        where: { requestId: 1 },
        order: { createdAt: 'ASC' },
      });
      expect(result.length).toBe(2);
    });
  });

  describe('getRequestWithAnswers', () => {
    it('должен вернуть заявку с ответами и клиентом', async () => {
      const mockRequest: Partial<LegacyRequest> = {
        id: 1,
        customerId: 100,
        subject: 'Тестовая заявка',
      };
      const mockAnswers: Partial<LegacyAnswer>[] = [
        { id: 1, requestId: 1, answer: 'Ответ' },
      ];
      const mockCustomer: Partial<LegacyCustomer> = {
        id: 100,
        firstName: 'Иван',
      };

      mockRequestRepository.findOne.mockResolvedValue(mockRequest as LegacyRequest);
      mockAnswerRepository.find.mockResolvedValue(mockAnswers as LegacyAnswer[]);
      mockCustomerRepository.findOne.mockResolvedValue(mockCustomer as LegacyCustomer);

      const result = await service.getRequestWithAnswers(1);

      expect(result.request).not.toBeNull();
      expect(result.answers.length).toBe(1);
      expect(result.customer?.firstName).toBe('Иван');
    });

    it('должен вернуть null для несуществующей заявки', async () => {
      mockRequestRepository.findOne.mockResolvedValue(null);

      const result = await service.getRequestWithAnswers(999);

      expect(result.request).toBeNull();
      expect(result.answers).toEqual([]);
    });
  });

  describe('getRequestsWithAnswersBatch', () => {
    it('должен вернуть пустую Map если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getRequestsWithAnswersBatch([1, 2, 3]);

      expect(result.size).toBe(0);
    });

    it('должен вернуть пустую Map для пустого массива', async () => {
      const result = await service.getRequestsWithAnswersBatch([]);
      expect(result.size).toBe(0);
    });

    it('должен вернуть заявки с ответами', async () => {
      const mockRequests: Partial<LegacyRequest>[] = [
        { id: 1, subject: 'Заявка 1' },
        { id: 2, subject: 'Заявка 2' },
      ];
      const mockAnswers: Partial<LegacyAnswer>[] = [
        { id: 1, requestId: 1, answer: 'Ответ 1.1' },
        { id: 2, requestId: 1, answer: 'Ответ 1.2' },
        { id: 3, requestId: 2, answer: 'Ответ 2.1' },
      ];

      const requestQb = {
        ...createMockQueryBuilder(),
        getMany: jest.fn().mockResolvedValue(mockRequests),
      };
      const answerQb = {
        ...createMockQueryBuilder(),
        getMany: jest.fn().mockResolvedValue(mockAnswers),
      };

      (mockRequestRepository.createQueryBuilder as jest.Mock).mockReturnValue(requestQb);
      (mockAnswerRepository.createQueryBuilder as jest.Mock).mockReturnValue(answerQb);

      const result = await service.getRequestsWithAnswersBatch([1, 2]);

      expect(result.size).toBe(2);
      expect(result.get(1)?.answers.length).toBe(2);
      expect(result.get(2)?.answers.length).toBe(1);
    });
  });

  describe('getIndexingStats', () => {
    it('должен вернуть нули если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getIndexingStats();

      expect(result.totalRequests).toBe(0);
      expect(result.closedRequests).toBe(0);
      expect(result.totalAnswers).toBe(0);
    });

    it('должен вернуть статистику', async () => {
      mockRequestRepository.count.mockResolvedValueOnce(344000); // total
      mockRequestRepository.count.mockResolvedValueOnce(280000); // closed
      mockAnswerRepository.count.mockResolvedValue(2300000);

      const result = await service.getIndexingStats();

      expect(result.totalRequests).toBe(344000);
      expect(result.closedRequests).toBe(280000);
      expect(result.totalAnswers).toBe(2300000);
      expect(result.averageAnswersPerRequest).toBeCloseTo(8.2, 1);
    });
  });

  describe('getDealsByCounterpartyId', () => {
    it('должен вернуть пустой массив если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getDealsByCounterpartyId(1);

      expect(result).toEqual([]);
    });

    it('должен вернуть пустой массив если counterpartyId не указан', async () => {
      const result = await service.getDealsByCounterpartyId(0);
      expect(result).toEqual([]);
    });

    it('должен вернуть сделки по контрагенту с этапами', async () => {
      const mockDeals: Partial<LegacyDeal>[] = [
        {
          id: 500,
          name: 'Поставка оборудования',
          sum: 1500000,
          dealStageId: 3,
          counterpartyId: 200,
          createdAt: new Date('2024-01-15'),
          closedAt: new Date('2024-02-15'),
          isClosed: true,
        },
        {
          id: 501,
          name: 'Сервисное обслуживание',
          sum: 250000,
          dealStageId: 2,
          counterpartyId: 200,
          createdAt: new Date('2024-03-01'),
          closedAt: null as unknown as Date,
          isClosed: false,
        },
      ];

      const mockStages: Partial<LegacyDealStage>[] = [
        { id: 2, name: 'Переговоры' },
        { id: 3, name: 'Закрыта успешно' },
      ];

      const queryBuilder = createMockQueryBuilder();
      (queryBuilder.getMany as jest.Mock).mockResolvedValue(mockDeals);
      (mockDealRepository.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      mockDealStageRepository.find.mockResolvedValue(mockStages as LegacyDealStage[]);

      const result = await service.getDealsByCounterpartyId(200);

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'deal.counterparty_id = :counterpartyId',
        { counterpartyId: 200 },
      );
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(500);
      expect(result[0].name).toBe('Поставка оборудования');
      expect(result[0].sum).toBe(1500000);
      expect(result[0].stageName).toBe('Закрыта успешно');
      expect(result[1].stageName).toBe('Переговоры');
    });
  });

  describe('getCounterpartyByCustomerId', () => {
    it('должен вернуть null если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getCounterpartyByCustomerId(100);

      expect(result).toBeNull();
    });

    it('должен вернуть null если customerId не указан', async () => {
      const result = await service.getCounterpartyByCustomerId(0);
      expect(result).toBeNull();
    });

    it('должен вернуть null если у клиента нет контрагента', async () => {
      const mockCustomer: Partial<LegacyCustomer> = {
        id: 100,
        firstName: 'Иван',
        defaultCounterpartyId: null as unknown as number,
      };

      mockCustomerRepository.findOne.mockResolvedValue(mockCustomer as LegacyCustomer);

      const result = await service.getCounterpartyByCustomerId(100);

      expect(result).toBeNull();
    });

    it('должен вернуть контрагента клиента', async () => {
      const mockCustomer: Partial<LegacyCustomer> = {
        id: 100,
        firstName: 'Иван',
        defaultCounterpartyId: 200,
      };
      const mockCounterparty: Partial<LegacyCounterparty> = {
        id: 200,
        name: 'ООО Рога и Копыта',
        inn: '7701234567',
        address: 'г. Москва, ул. Пушкина, д. 1',
      };

      mockCustomerRepository.findOne.mockResolvedValue(mockCustomer as LegacyCustomer);
      mockCounterpartyRepository.findOne.mockResolvedValue(mockCounterparty as LegacyCounterparty);

      const result = await service.getCounterpartyByCustomerId(100);

      expect(mockCustomerRepository.findOne).toHaveBeenCalledWith({
        where: { id: 100 },
      });
      expect(mockCounterpartyRepository.findOne).toHaveBeenCalledWith({
        where: { id: 200 },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe(200);
      expect(result?.name).toBe('ООО Рога и Копыта');
      expect(result?.inn).toBe('7701234567');
      expect(result?.address).toBe('г. Москва, ул. Пушкина, д. 1');
    });

    it('должен вернуть null если контрагент не найден', async () => {
      const mockCustomer: Partial<LegacyCustomer> = {
        id: 100,
        defaultCounterpartyId: 999,
      };

      mockCustomerRepository.findOne.mockResolvedValue(mockCustomer as LegacyCustomer);
      mockCounterpartyRepository.findOne.mockResolvedValue(null);

      const result = await service.getCounterpartyByCustomerId(100);

      expect(result).toBeNull();
    });
  });

  describe('getProductsByDealId', () => {
    it('должен вернуть пустой массив если БД недоступна', async () => {
      const unavailableDataSource = {
        ...mockDataSource,
        isInitialized: false,
      } as unknown as jest.Mocked<DataSource>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyService,
          { provide: LEGACY_DATA_SOURCE, useValue: unavailableDataSource },
        ],
      }).compile();

      const testService = module.get<LegacyService>(LegacyService);
      const result = await testService.getProductsByDealId(500);

      expect(result).toEqual([]);
    });

    it('должен вернуть пустой массив если dealId не указан', async () => {
      const result = await service.getProductsByDealId(0);
      expect(result).toEqual([]);
    });

    it('должен вернуть продукты сделки через raw query', async () => {
      const mockProducts = [
        { id: 1, name: 'Станок XYZ', code: 'XYZ-001', quantity: 2 },
        { id: 2, name: 'Комплектующие ABC', code: 'ABC-002', quantity: 10 },
      ];

      mockDataSource.query.mockResolvedValue(mockProducts);

      const result = await service.getProductsByDealId(500);

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT p.productID'),
        [500],
      );
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('Станок XYZ');
      expect(result[0].code).toBe('XYZ-001');
      expect(result[0].quantity).toBe(2);
    });

    it('должен вернуть пустой массив если таблица deal_product не существует', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Table does not exist'));

      const result = await service.getProductsByDealId(500);

      expect(result).toEqual([]);
    });
  });
});
