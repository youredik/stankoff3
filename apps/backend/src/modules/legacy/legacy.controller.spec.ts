import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LegacyController } from './legacy.controller';
import { LegacyService } from './services/legacy.service';
import {
  LegacyCustomerDto,
  LegacyProductDto,
  LegacyCounterpartyDto,
  LegacyDealDto,
} from './dto';

describe('LegacyController', () => {
  let controller: LegacyController;
  let mockLegacyService: jest.Mocked<LegacyService>;

  beforeEach(async () => {
    mockLegacyService = {
      isAvailable: jest.fn().mockReturnValue(true),
      searchCustomers: jest.fn(),
      getCustomerById: jest.fn(),
      searchProducts: jest.fn(),
      getProductById: jest.fn(),
      getCategories: jest.fn(),
      searchCounterparties: jest.fn(),
      getCounterpartyById: jest.fn(),
      searchDeals: jest.fn(),
      getDealById: jest.fn(),
    } as unknown as jest.Mocked<LegacyService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegacyController],
      providers: [
        {
          provide: LegacyService,
          useValue: mockLegacyService,
        },
      ],
    }).compile();

    controller = module.get<LegacyController>(LegacyController);
  });

  describe('getHealth', () => {
    it('должен вернуть available: true когда БД доступна', () => {
      mockLegacyService.isAvailable.mockReturnValue(true);

      const result = controller.getHealth();

      expect(result.available).toBe(true);
      expect(result.message).toBe('Legacy database is connected');
    });

    it('должен вернуть available: false когда БД недоступна', () => {
      mockLegacyService.isAvailable.mockReturnValue(false);

      const result = controller.getHealth();

      expect(result.available).toBe(false);
      expect(result.message).toBe('Legacy database is not available');
    });
  });

  describe('searchCustomers', () => {
    it('должен вызвать сервис с правильными параметрами', async () => {
      const mockResult = {
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
      };
      mockLegacyService.searchCustomers.mockResolvedValue(mockResult);

      await controller.searchCustomers('Иван', '10', '0', 'false');

      expect(mockLegacyService.searchCustomers).toHaveBeenCalledWith('Иван', {
        limit: 10,
        offset: 0,
        employeesOnly: false,
      });
    });

    it('должен поддерживать фильтр employeesOnly', async () => {
      mockLegacyService.searchCustomers.mockResolvedValue({
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      await controller.searchCustomers('test', '10', '0', 'true');

      expect(mockLegacyService.searchCustomers).toHaveBeenCalledWith('test', {
        limit: 10,
        offset: 0,
        employeesOnly: true,
      });
    });
  });

  describe('getCustomer', () => {
    it('должен вернуть клиента по ID', async () => {
      const mockCustomer: LegacyCustomerDto = {
        id: 1,
        firstName: 'Иван',
        lastName: 'Иванов',
        displayName: 'Иван Иванов',
        email: 'ivan@test.ru',
        phone: '79001234567',
        isEmployee: false,
        defaultCounterpartyId: 0,
        registrationDate: null,
      };
      mockLegacyService.getCustomerById.mockResolvedValue(mockCustomer);

      const result = await controller.getCustomer(1);

      expect(result).toEqual(mockCustomer);
      expect(mockLegacyService.getCustomerById).toHaveBeenCalledWith(1);
    });

    it('должен выбросить NotFoundException если клиент не найден', async () => {
      mockLegacyService.getCustomerById.mockResolvedValue(null);

      await expect(controller.getCustomer(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchProducts', () => {
    it('должен вызвать сервис с правильными параметрами', async () => {
      mockLegacyService.searchProducts.mockResolvedValue({
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      await controller.searchProducts('Станок', '10', '0', '5', 'true');

      expect(mockLegacyService.searchProducts).toHaveBeenCalledWith('Станок', {
        limit: 10,
        offset: 0,
        categoryId: 5,
        inStockOnly: true,
      });
    });
  });

  describe('getProduct', () => {
    it('должен вернуть товар по ID', async () => {
      const mockProduct: LegacyProductDto = {
        id: 1,
        name: 'Станок XYZ',
        uri: 'stanok-xyz',
        price: 100000,
        categoryId: 5,
        categoryName: 'Токарные станки',
        supplierId: 1,
        productCode: 'XYZ-001',
        factoryName: 'Завод №1',
        isInStock: true,
        inStock: 5,
      };
      mockLegacyService.getProductById.mockResolvedValue(mockProduct);

      const result = await controller.getProduct(1);

      expect(result).toEqual(mockProduct);
    });

    it('должен выбросить NotFoundException если товар не найден', async () => {
      mockLegacyService.getProductById.mockResolvedValue(null);

      await expect(controller.getProduct(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategories', () => {
    it('должен вернуть список категорий', async () => {
      const mockCategories = [
        { id: 1, name: 'Токарные станки', isActive: 1 },
        { id: 2, name: 'Фрезерные станки', isActive: 1 },
      ];
      mockLegacyService.getCategories.mockResolvedValue(mockCategories as any);

      const result = await controller.getCategories();

      expect(result.length).toBe(2);
    });
  });

  describe('searchCounterparties', () => {
    it('должен вызвать сервис с правильными параметрами', async () => {
      mockLegacyService.searchCounterparties.mockResolvedValue({
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      await controller.searchCounterparties('ООО', '10', '0');

      expect(mockLegacyService.searchCounterparties).toHaveBeenCalledWith('ООО', {
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getCounterparty', () => {
    it('должен вернуть контрагента по ID', async () => {
      const mockCounterparty: LegacyCounterpartyDto = {
        id: 1,
        name: 'ООО "Тест"',
        shortName: 'Тест',
        inn: '1234567890',
        kpp: '123456789',
        ogrn: '1234567890123',
        address: 'г. Москва',
        director: 'Иванов И.И.',
        type: 'legal',
      };
      mockLegacyService.getCounterpartyById.mockResolvedValue(mockCounterparty);

      const result = await controller.getCounterparty(1);

      expect(result).toEqual(mockCounterparty);
    });

    it('должен выбросить NotFoundException если контрагент не найден', async () => {
      mockLegacyService.getCounterpartyById.mockResolvedValue(null);

      await expect(controller.getCounterparty(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchDeals', () => {
    it('должен вызвать сервис с правильными параметрами', async () => {
      mockLegacyService.searchDeals.mockResolvedValue({
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      await controller.searchDeals('5', '10', '10', '0');

      expect(mockLegacyService.searchDeals).toHaveBeenCalledWith({
        counterpartyId: 5,
        employeeUserId: 10,
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getDeal', () => {
    it('должен вернуть сделку по ID', async () => {
      const mockDeal: LegacyDealDto = {
        id: 1,
        name: 'Сделка с клиентом',
        sum: 100000,
        formattedSum: '100 000 ₽',
        counterpartyId: 5,
        counterpartyName: 'ООО "Клиент"',
        employeeUserId: 10,
        dealStageId: 2,
        stageName: 'Переговоры',
        stageColor: '#FF0000',
        funnelId: 1,
        status: null,
        completion: null,
        isClosed: false,
        createdAt: new Date(),
        updatedAt: null,
        closedAt: null,
      };
      mockLegacyService.getDealById.mockResolvedValue(mockDeal);

      const result = await controller.getDeal(1);

      expect(result).toEqual(mockDeal);
    });

    it('должен выбросить NotFoundException если сделка не найдена', async () => {
      mockLegacyService.getDealById.mockResolvedValue(null);

      await expect(controller.getDeal(999)).rejects.toThrow(NotFoundException);
    });
  });
});
