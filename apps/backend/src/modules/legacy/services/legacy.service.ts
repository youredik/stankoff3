import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, Like, Repository } from 'typeorm';
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
import {
  LegacyCustomerDto,
  LegacyCustomerSearchResultDto,
  LegacyProductDto,
  LegacyProductSearchResultDto,
  LegacyCounterpartyDto,
  LegacyCounterpartySearchResultDto,
  LegacyDealDto,
  LegacyDealSearchResultDto,
  LegacyEmployeeDto,
  LegacyEmployeeSearchResultDto,
  LegacyDepartmentDto,
} from '../dto';

/**
 * Сервис для работы с Legacy БД
 * Предоставляет READ-ONLY доступ к данным старой системы
 */
@Injectable()
export class LegacyService implements OnModuleInit {
  private readonly logger = new Logger(LegacyService.name);
  private customerRepository: Repository<LegacyCustomer>;
  private productRepository: Repository<LegacyProduct>;
  private categoryRepository: Repository<LegacyCategory>;
  private counterpartyRepository: Repository<LegacyCounterparty>;
  private dealRepository: Repository<LegacyDeal>;
  private dealStageRepository: Repository<LegacyDealStage>;
  private requestRepository: Repository<LegacyRequest>;
  private answerRepository: Repository<LegacyAnswer>;
  private managerRepository: Repository<LegacyManager>;
  private departmentRepository: Repository<LegacyDepartment>;
  private isConnected = false;

  constructor(
    @Inject(LEGACY_DATA_SOURCE)
    private readonly legacyDataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      if (!this.legacyDataSource.isInitialized) {
        await this.legacyDataSource.initialize();
      }
      this.customerRepository = this.legacyDataSource.getRepository(LegacyCustomer);
      this.productRepository = this.legacyDataSource.getRepository(LegacyProduct);
      this.categoryRepository = this.legacyDataSource.getRepository(LegacyCategory);
      this.counterpartyRepository = this.legacyDataSource.getRepository(LegacyCounterparty);
      this.dealRepository = this.legacyDataSource.getRepository(LegacyDeal);
      this.dealStageRepository = this.legacyDataSource.getRepository(LegacyDealStage);
      this.requestRepository = this.legacyDataSource.getRepository(LegacyRequest);
      this.answerRepository = this.legacyDataSource.getRepository(LegacyAnswer);
      this.managerRepository = this.legacyDataSource.getRepository(LegacyManager);
      this.departmentRepository = this.legacyDataSource.getRepository(LegacyDepartment);
      this.isConnected = true;
      this.logger.log('Legacy database connection established');
    } catch (error) {
      this.logger.warn(`Legacy database not available: ${error.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Проверка доступности legacy БД
   */
  isAvailable(): boolean {
    return this.isConnected && this.legacyDataSource?.isInitialized;
  }

  // ==================== CUSTOMERS ====================

  /**
   * Поиск клиентов по имени, email или телефону
   */
  async searchCustomers(
    query: string,
    options: { limit?: number; offset?: number; employeesOnly?: boolean } = {},
  ): Promise<LegacyCustomerSearchResultDto> {
    if (!this.isAvailable()) {
      return { items: [], total: 0, limit: options.limit || 10, offset: options.offset || 0 };
    }

    const { limit = 10, offset = 0, employeesOnly = false } = options;
    const searchPattern = `%${query}%`;

    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .where(
        '(customer.first_name LIKE :pattern OR customer.last_name LIKE :pattern OR customer.Email LIKE :pattern OR customer.phone LIKE :pattern)',
        { pattern: searchPattern },
      );

    if (employeesOnly) {
      queryBuilder.andWhere('customer.is_manager = :isManager', { isManager: 1 });
    }

    const [customers, total] = await queryBuilder
      .orderBy('customer.last_name', 'ASC')
      .addOrderBy('customer.first_name', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items: customers.map((customer) => LegacyCustomerDto.fromEntity(customer)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Получить клиента по ID
   */
  async getCustomerById(id: number): Promise<LegacyCustomerDto | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const customer = await this.customerRepository.findOne({
      where: { id },
    });

    return customer ? LegacyCustomerDto.fromEntity(customer) : null;
  }

  // ==================== PRODUCTS ====================

  /**
   * Поиск товаров по названию или коду
   */
  async searchProducts(
    query: string,
    options: { limit?: number; offset?: number; categoryId?: number; inStockOnly?: boolean } = {},
  ): Promise<LegacyProductSearchResultDto> {
    if (!this.isAvailable()) {
      return { items: [], total: 0, limit: options.limit || 10, offset: options.offset || 0 };
    }

    const { limit = 10, offset = 0, categoryId, inStockOnly = false } = options;
    const searchPattern = `%${query}%`;

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .where('product.enabled = :enabled', { enabled: 1 })
      .andWhere(
        '(product.name LIKE :pattern OR product.product_code LIKE :pattern OR product.factory_name LIKE :pattern)',
        { pattern: searchPattern },
      );

    if (categoryId) {
      queryBuilder.andWhere('product.categoryID = :categoryId', { categoryId });
    }

    if (inStockOnly) {
      queryBuilder.andWhere('product.in_stock > 0');
    }

    const [products, total] = await queryBuilder
      .orderBy('product.name', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Загружаем категории для найденных товаров
    const categoryIds = [...new Set(products.map((product) => product.categoryId))];
    const categories = categoryIds.length
      ? await this.categoryRepository.find({
          where: categoryIds.map((id) => ({ id })),
        })
      : [];
    const categoryMap = new Map(categories.map((category) => [category.id, category]));

    return {
      items: products.map((product) =>
        LegacyProductDto.fromEntity(product, categoryMap.get(product.categoryId)),
      ),
      total,
      limit,
      offset,
    };
  }

  /**
   * Получить товар по ID
   */
  async getProductById(id: number): Promise<LegacyProductDto | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const product = await this.productRepository.findOne({
      where: { id, enabled: 1 },
    });

    if (!product) {
      return null;
    }

    const category = product.categoryId
      ? (await this.categoryRepository.findOne({ where: { id: product.categoryId } })) ?? undefined
      : undefined;

    return LegacyProductDto.fromEntity(product, category);
  }

  /**
   * Получить все категории товаров
   */
  async getCategories(): Promise<LegacyCategory[]> {
    if (!this.isAvailable()) {
      return [];
    }

    return this.categoryRepository.find({
      where: { isActive: 1 },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  // ==================== COUNTERPARTIES ====================

  /**
   * Поиск контрагентов по названию или ИНН
   */
  async searchCounterparties(
    query: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<LegacyCounterpartySearchResultDto> {
    if (!this.isAvailable()) {
      return { items: [], total: 0, limit: options.limit || 10, offset: options.offset || 0 };
    }

    const { limit = 10, offset = 0 } = options;
    const searchPattern = `%${query}%`;

    const [counterparties, total] = await this.counterpartyRepository
      .createQueryBuilder('counterparty')
      .where('counterparty.name LIKE :pattern OR counterparty.inn LIKE :pattern', {
        pattern: searchPattern,
      })
      .orderBy('counterparty.name', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items: counterparties.map((counterparty) => LegacyCounterpartyDto.fromEntity(counterparty)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Получить контрагента по ID
   */
  async getCounterpartyById(id: number): Promise<LegacyCounterpartyDto | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const counterparty = await this.counterpartyRepository.findOne({
      where: { id },
    });

    return counterparty ? LegacyCounterpartyDto.fromEntity(counterparty) : null;
  }

  // ==================== DEALS ====================

  /**
   * Поиск сделок по контрагенту или менеджеру
   */
  async searchDeals(options: {
    counterpartyId?: number;
    employeeUserId?: number;
    limit?: number;
    offset?: number;
  }): Promise<LegacyDealSearchResultDto> {
    if (!this.isAvailable()) {
      return { items: [], total: 0, limit: options.limit || 10, offset: options.offset || 0 };
    }

    const { counterpartyId, employeeUserId, limit = 10, offset = 0 } = options;

    const queryBuilder = this.dealRepository.createQueryBuilder('deal');

    if (counterpartyId) {
      queryBuilder.andWhere('deal.counterparty_id = :counterpartyId', { counterpartyId });
    }

    if (employeeUserId) {
      queryBuilder.andWhere('deal.employee_user_id = :employeeUserId', { employeeUserId });
    }

    const [deals, total] = await queryBuilder
      .orderBy('deal.created_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Загружаем этапы и контрагентов
    const stageIds = [...new Set(deals.map((deal) => deal.dealStageId).filter(Boolean))];
    const counterpartyIds = [...new Set(deals.map((deal) => deal.counterpartyId).filter(Boolean))];

    const [stages, counterparties] = await Promise.all([
      stageIds.length
        ? this.dealStageRepository.find({
            where: stageIds.map((id) => ({ id })),
          })
        : [],
      counterpartyIds.length
        ? this.counterpartyRepository.find({
            where: counterpartyIds.map((id) => ({ id })),
          })
        : [],
    ]);

    const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
    const counterpartyMap = new Map(counterparties.map((cp) => [cp.id, cp]));

    return {
      items: deals.map((deal) =>
        LegacyDealDto.fromEntity(
          deal,
          stageMap.get(deal.dealStageId),
          counterpartyMap.get(deal.counterpartyId),
        ),
      ),
      total,
      limit,
      offset,
    };
  }

  /**
   * Получить сделку по ID
   */
  async getDealById(id: number): Promise<LegacyDealDto | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const deal = await this.dealRepository.findOne({
      where: { id },
    });

    if (!deal) {
      return null;
    }

    const [stageResult, counterpartyResult] = await Promise.all([
      deal.dealStageId
        ? this.dealStageRepository.findOne({ where: { id: deal.dealStageId } })
        : null,
      deal.counterpartyId
        ? this.counterpartyRepository.findOne({ where: { id: deal.counterpartyId } })
        : null,
    ]);

    return LegacyDealDto.fromEntity(
      deal,
      stageResult ?? undefined,
      counterpartyResult ?? undefined,
    );
  }

  // ==================== REQUESTS ====================

  /**
   * Получить обращения клиента
   */
  async getRequestsByCustomerId(
    customerId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<LegacyRequest[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const { limit = 20, offset = 0 } = options;

    return this.requestRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
  }

  // ==================== EMPLOYEES (Сотрудники) ====================

  /**
   * Поиск сотрудников по имени или alias
   * Использует двухэтапный подход: сначала ищет клиентов по имени,
   * затем находит менеджеров с соответствующими user_id или alias
   */
  async searchEmployees(
    query: string,
    options: { limit?: number; offset?: number; activeOnly?: boolean; departmentId?: number } = {},
  ): Promise<LegacyEmployeeSearchResultDto> {
    if (!this.isAvailable()) {
      return { items: [], total: 0, limit: options.limit || 10, offset: options.offset || 0 };
    }

    const { limit = 10, offset = 0, activeOnly = true, departmentId } = options;
    const searchPattern = `%${query}%`;

    let matchingUserIds: number[] = [];

    // Если есть поисковый запрос, сначала находим клиентов по имени/фамилии
    if (query && query.trim()) {
      const matchingCustomers = await this.customerRepository
        .createQueryBuilder('customer')
        .select('customer.customerID', 'customerId')
        .where('customer.first_name LIKE :pattern OR customer.last_name LIKE :pattern', {
          pattern: searchPattern,
        })
        .getRawMany();
      matchingUserIds = matchingCustomers.map((c) => c.customerId);
    }

    // Получаем менеджеров
    const queryBuilder = this.managerRepository.createQueryBuilder('manager');

    // Поиск по alias ИЛИ по найденным user_id из SS_customers
    if (query && query.trim()) {
      if (matchingUserIds.length > 0) {
        queryBuilder.where(
          '(manager.alias LIKE :pattern OR manager.user_id IN (:...userIds))',
          { pattern: searchPattern, userIds: matchingUserIds },
        );
      } else {
        // Только по alias, если клиентов не нашли
        queryBuilder.where('manager.alias LIKE :pattern', { pattern: searchPattern });
      }
    }

    if (activeOnly) {
      if (query && query.trim()) {
        queryBuilder.andWhere('manager.active = :active', { active: 1 });
      } else {
        queryBuilder.where('manager.active = :active', { active: 1 });
      }
    }

    if (departmentId) {
      queryBuilder.andWhere('manager.department_id = :departmentId', { departmentId });
    }

    const [managers, total] = await queryBuilder
      .orderBy('manager.sort_order', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Загружаем связанные данные
    const userIds = managers.map((m) => m.userId);
    const departmentIds = [...new Set(managers.map((m) => m.departmentId).filter(Boolean))];

    const [customers, departments] = await Promise.all([
      userIds.length
        ? this.customerRepository
            .createQueryBuilder('customer')
            .where('customer.customerID IN (:...userIds)', { userIds })
            .getMany()
        : [],
      departmentIds.length
        ? this.departmentRepository.find({
            where: departmentIds.map((id) => ({ id })),
          })
        : [],
    ]);

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const departmentMap = new Map(departments.map((d) => [d.id, d]));

    return {
      items: managers.map((manager) =>
        LegacyEmployeeDto.fromEntities(
          manager,
          customerMap.get(manager.userId),
          departmentMap.get(manager.departmentId),
        ),
      ),
      total,
      limit,
      offset,
    };
  }

  /**
   * Получить сотрудника по ID
   */
  async getEmployeeById(id: number): Promise<LegacyEmployeeDto | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const manager = await this.managerRepository.findOne({
      where: { id },
    });

    if (!manager) {
      return null;
    }

    const [customer, department] = await Promise.all([
      this.customerRepository.findOne({ where: { id: manager.userId } }),
      manager.departmentId
        ? this.departmentRepository.findOne({ where: { id: manager.departmentId } })
        : null,
    ]);

    return LegacyEmployeeDto.fromEntities(
      manager,
      customer ?? undefined,
      department ?? undefined,
    );
  }

  /**
   * Получить всех активных сотрудников (для импорта в Keycloak)
   */
  async getAllActiveEmployees(): Promise<LegacyEmployeeDto[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const managers = await this.managerRepository.find({
      where: { active: 1 },
      order: { sortOrder: 'ASC' },
    });

    const userIds = managers.map((m) => m.userId);
    const departmentIds = [...new Set(managers.map((m) => m.departmentId).filter(Boolean))];

    const [customers, departments] = await Promise.all([
      userIds.length
        ? this.customerRepository
            .createQueryBuilder('customer')
            .where('customer.customerID IN (:...userIds)', { userIds })
            .getMany()
        : [],
      departmentIds.length
        ? this.departmentRepository.find({
            where: departmentIds.map((id) => ({ id })),
          })
        : [],
    ]);

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const departmentMap = new Map(departments.map((d) => [d.id, d]));

    return managers.map((manager) =>
      LegacyEmployeeDto.fromEntities(
        manager,
        customerMap.get(manager.userId),
        departmentMap.get(manager.departmentId),
      ),
    );
  }

  /**
   * Получить список отделов
   */
  async getDepartments(): Promise<LegacyDepartmentDto[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const departments = await this.departmentRepository.find({
      order: { sortOrder: 'ASC' },
    });

    // Получаем количество сотрудников по отделам
    const counts = await this.managerRepository
      .createQueryBuilder('manager')
      .select('manager.department_id', 'departmentId')
      .addSelect('COUNT(*)', 'count')
      .where('manager.active = :active', { active: 1 })
      .groupBy('manager.department_id')
      .getRawMany();

    const countMap = new Map(counts.map((c) => [c.departmentId, parseInt(c.count, 10)]));

    return departments.map((dept) => {
      const dto = LegacyDepartmentDto.fromEntity(dept);
      dto.employeesCount = countMap.get(dept.id) || 0;
      return dto;
    });
  }

  // ==================== MIGRATION HELPERS ====================

  /**
   * Получить все заявки батчем (для миграции)
   * В отличие от getRequestsForIndexing, возвращает ВСЕ заявки (не только закрытые)
   */
  async getAllRequestsBatch(
    offset: number,
    limit: number,
  ): Promise<LegacyRequest[]> {
    if (!this.isAvailable()) {
      return [];
    }

    return this.requestRepository
      .createQueryBuilder('request')
      .orderBy('request.RID', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  /**
   * Общее количество всех заявок
   */
  async getRequestsCount(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    return this.requestRepository.count();
  }

  /**
   * Batch-получение клиентов по массиву ID
   */
  async getCustomersByIds(
    customerIds: number[],
  ): Promise<Map<number, LegacyCustomer>> {
    if (!this.isAvailable() || customerIds.length === 0) {
      return new Map();
    }

    const customers = await this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.customerID IN (:...customerIds)', { customerIds })
      .getMany();

    return new Map(customers.map((c) => [c.id, c]));
  }

  /**
   * Получить заявки по массиву ID
   */
  async getRequestsByIds(ids: number[]): Promise<LegacyRequest[]> {
    if (!this.isAvailable() || ids.length === 0) {
      return [];
    }

    return this.requestRepository
      .createQueryBuilder('request')
      .where('request.RID IN (:...ids)', { ids })
      .getMany();
  }

  /**
   * Получить новые/обновлённые заявки с указанной даты (для синхронизации)
   */
  async getNewRequestsSince(
    since: Date,
    limit: number = 500,
  ): Promise<LegacyRequest[]> {
    if (!this.isAvailable()) {
      return [];
    }

    return this.requestRepository
      .createQueryBuilder('request')
      .where('request.update_date > :since', { since })
      .orderBy('request.update_date', 'ASC')
      .take(limit)
      .getMany();
  }

  /**
   * Получить все записи менеджеров (для построения маппинга пользователей)
   */
  async getAllManagers(): Promise<LegacyManager[]> {
    if (!this.isAvailable()) {
      return [];
    }

    return this.managerRepository.find();
  }

  /**
   * Получить новые ответы для заявок с указанной даты (для синхронизации)
   */
  async getNewAnswersSince(
    since: Date,
    requestIds: number[],
  ): Promise<LegacyAnswer[]> {
    if (!this.isAvailable() || requestIds.length === 0) {
      return [];
    }

    return this.answerRepository
      .createQueryBuilder('answer')
      .where('answer.RID IN (:...requestIds)', { requestIds })
      .andWhere('answer.add_date > :since', { since })
      .orderBy('answer.add_date', 'ASC')
      .getMany();
  }

  // ==================== SYSTEM SYNC HELPERS ====================

  /**
   * Получить контрагентов батчем (для синхронизации справочников)
   */
  async getAllCounterpartiesBatch(offset: number, limit: number): Promise<LegacyCounterparty[]> {
    if (!this.isAvailable()) return [];
    return this.counterpartyRepository
      .createQueryBuilder('cp')
      .orderBy('cp.id', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  /**
   * Общее количество контрагентов
   */
  async getCounterpartiesCount(): Promise<number> {
    if (!this.isAvailable()) return 0;
    return this.counterpartyRepository.count();
  }

  /**
   * Получить контакты (не сотрудников) батчем
   */
  async getAllContactsBatch(offset: number, limit: number): Promise<LegacyCustomer[]> {
    if (!this.isAvailable()) return [];
    return this.customerRepository
      .createQueryBuilder('c')
      .where('c.is_manager = :isManager', { isManager: 0 })
      .orderBy('c.customerID', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  /**
   * Получить контакты с привязкой к контрагентам (приоритетные)
   */
  async getContactsWithCounterpartyBatch(offset: number, limit: number): Promise<LegacyCustomer[]> {
    if (!this.isAvailable()) return [];
    return this.customerRepository
      .createQueryBuilder('c')
      .where('c.is_manager = :isManager', { isManager: 0 })
      .andWhere('c.default_counterparty_id > 0')
      .orderBy('c.customerID', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  /**
   * Общее количество контактов (не сотрудников)
   */
  async getContactsCount(withCounterpartyOnly = false): Promise<number> {
    if (!this.isAvailable()) return 0;
    const qb = this.customerRepository
      .createQueryBuilder('c')
      .where('c.is_manager = :isManager', { isManager: 0 });
    if (withCounterpartyOnly) {
      qb.andWhere('c.default_counterparty_id > 0');
    }
    return qb.getCount();
  }

  /**
   * Получить активные товары батчем
   */
  async getAllActiveProductsBatch(offset: number, limit: number): Promise<LegacyProduct[]> {
    if (!this.isAvailable()) return [];
    return this.productRepository
      .createQueryBuilder('p')
      .where('p.enabled = :enabled', { enabled: 1 })
      .orderBy('p.productID', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  /**
   * Общее количество активных товаров
   */
  async getActiveProductsCount(): Promise<number> {
    if (!this.isAvailable()) return 0;
    return this.productRepository.count({ where: { enabled: 1 } });
  }

  /**
   * Получить все активные категории
   */
  async getAllActiveCategories(): Promise<LegacyCategory[]> {
    if (!this.isAvailable()) return [];
    return this.categoryRepository.find({
      where: { isActive: 1 },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  // ==================== RICH DATA FOR AI ====================

  /**
   * Получить полную информацию о клиенте для RAG
   * Включает контрагента, историю обращений и т.д.
   */
  async getCustomerRichInfo(customerId: number): Promise<{
    id: number;
    fullName: string;
    email?: string;
    phone?: string;
    counterparty?: {
      id: number;
      name: string;
      inn?: string;
    };
    isEmployee: boolean;
    registrationDate?: Date;
    totalRequests?: number;
  } | null> {
    if (!this.isAvailable() || !customerId) {
      return null;
    }

    try {
      const customer = await this.customerRepository.findOne({
        where: { id: customerId },
      });

      if (!customer) {
        return null;
      }

      const firstName = customer.firstName || '';
      const lastName = customer.lastName || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || customer.email || `Клиент #${customerId}`;

      // Получаем контрагента
      let counterparty: { id: number; name: string; inn?: string } | undefined;
      if (customer.defaultCounterpartyId) {
        const cp = await this.counterpartyRepository.findOne({
          where: { id: customer.defaultCounterpartyId },
        });
        if (cp) {
          counterparty = {
            id: cp.id,
            name: cp.name,
            inn: cp.inn || undefined,
          };
        }
      }

      // Подсчёт обращений клиента
      const totalRequests = await this.requestRepository.count({
        where: { customerId },
      });

      return {
        id: customerId,
        fullName,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        counterparty,
        isEmployee: customer.isManager === 1,
        registrationDate: customer.registrationDate || undefined,
        totalRequests,
      };
    } catch {
      return null;
    }
  }

  /**
   * Получить имена сотрудников по их user ID (customerID)
   * Используется для RAG индексации - добавление имён специалистов в metadata
   */
  async getEmployeeNamesByUserIds(userIds: number[]): Promise<Map<number, { firstName: string; lastName: string; fullName: string }>> {
    const result = new Map<number, { firstName: string; lastName: string; fullName: string }>();

    if (!this.isAvailable() || userIds.length === 0) {
      return result;
    }

    const customers = await this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.customerID IN (:...userIds)', { userIds })
      .andWhere('customer.is_manager = :isManager', { isManager: 1 })
      .getMany();

    for (const customer of customers) {
      const firstName = customer.firstName || '';
      const lastName = customer.lastName || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || `Сотрудник #${customer.id}`;

      result.set(customer.id, { firstName, lastName, fullName });
    }

    return result;
  }

  /**
   * Получить информацию о менеджере заявки
   */
  async getManagerInfo(managerId: number): Promise<{
    id: number;
    fullName: string;
    alias?: string;
    departmentName?: string;
  } | null> {
    if (!this.isAvailable() || !managerId) {
      return null;
    }

    const manager = await this.managerRepository.findOne({
      where: { id: managerId },
    });

    if (!manager) {
      return null;
    }

    // Получаем имя из SS_customers
    const customer = await this.customerRepository.findOne({
      where: { id: manager.userId },
    });

    // Получаем отдел
    const department = manager.departmentId
      ? await this.departmentRepository.findOne({ where: { id: manager.departmentId } })
      : null;

    const firstName = customer?.firstName || '';
    const lastName = customer?.lastName || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || manager.alias || `Менеджер #${managerId}`;

    return {
      id: managerId,
      fullName,
      alias: manager.alias || undefined,
      departmentName: department?.title || undefined,
    };
  }

  // ==================== RAG INDEXING (для AI) ====================

  /**
   * Получить заявки для RAG индексации с пагинацией
   * Возвращает только закрытые заявки (closed = 1) с непустым контентом
   */
  async getRequestsForIndexing(options: {
    limit?: number;
    offset?: number;
    modifiedAfter?: Date;
  } = {}): Promise<{ items: LegacyRequest[]; total: number }> {
    if (!this.isAvailable()) {
      return { items: [], total: 0 };
    }

    const { limit = 100, offset = 0, modifiedAfter } = options;

    const queryBuilder = this.requestRepository
      .createQueryBuilder('request')
      .where('request.closed = :closed', { closed: 1 }); // 1 = закрытая заявка

    if (modifiedAfter) {
      queryBuilder.andWhere('request.add_date > :modifiedAfter', { modifiedAfter });
    }

    const [items, total] = await queryBuilder
      .orderBy('request.RID', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  /**
   * Получить общее количество заявок для индексации
   */
  async getIndexableRequestsCount(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    return this.requestRepository
      .createQueryBuilder('request')
      .where('request.closed = :closed', { closed: 1 })
      .getCount();
  }

  /**
   * Получить ответы для конкретной заявки
   */
  async getAnswersByRequestId(requestId: number): Promise<LegacyAnswer[]> {
    if (!this.isAvailable()) {
      return [];
    }

    return this.answerRepository.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Получить заявку с ответами для индексации
   * Формирует полный контекст диалога для RAG
   */
  async getRequestWithAnswers(requestId: number): Promise<{
    request: LegacyRequest | null;
    answers: LegacyAnswer[];
    customer: LegacyCustomer | null;
  }> {
    if (!this.isAvailable()) {
      return { request: null, answers: [], customer: null };
    }

    const request = await this.requestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      return { request: null, answers: [], customer: null };
    }

    const [answers, customer] = await Promise.all([
      this.answerRepository.find({
        where: { requestId },
        order: { createdAt: 'ASC' },
      }),
      request.customerId
        ? this.customerRepository.findOne({ where: { id: request.customerId } })
        : null,
    ]);

    return { request, answers, customer };
  }

  /**
   * Batch-получение заявок с ответами для индексации
   * Оптимизировано для массовой загрузки
   */
  async getRequestsWithAnswersBatch(requestIds: number[]): Promise<Map<number, {
    request: LegacyRequest;
    answers: LegacyAnswer[];
  }>> {
    if (!this.isAvailable() || requestIds.length === 0) {
      return new Map();
    }

    // Получаем заявки
    const requests = await this.requestRepository
      .createQueryBuilder('request')
      .where('request.RID IN (:...requestIds)', { requestIds })
      .getMany();

    // Получаем все ответы для этих заявок одним запросом
    const answers = await this.answerRepository
      .createQueryBuilder('answer')
      .where('answer.RID IN (:...requestIds)', { requestIds })
      .orderBy('answer.add_date', 'ASC')
      .getMany();

    // Группируем ответы по requestId
    const answersByRequestId = new Map<number, LegacyAnswer[]>();
    for (const answer of answers) {
      const existing = answersByRequestId.get(answer.requestId) || [];
      existing.push(answer);
      answersByRequestId.set(answer.requestId, existing);
    }

    // Формируем результат
    const result = new Map<number, { request: LegacyRequest; answers: LegacyAnswer[] }>();
    for (const request of requests) {
      result.set(request.id, {
        request,
        answers: answersByRequestId.get(request.id) || [],
      });
    }

    return result;
  }

  /**
   * Получить статистику по заявкам и ответам для RAG
   */
  async getIndexingStats(): Promise<{
    totalRequests: number;
    closedRequests: number;
    totalAnswers: number;
    averageAnswersPerRequest: number;
  }> {
    if (!this.isAvailable()) {
      return {
        totalRequests: 0,
        closedRequests: 0,
        totalAnswers: 0,
        averageAnswersPerRequest: 0,
      };
    }

    const [totalRequests, closedRequests, totalAnswers] = await Promise.all([
      this.requestRepository.count(),
      this.requestRepository.count({ where: { closed: 1 } }),
      this.answerRepository.count(),
    ]);

    return {
      totalRequests,
      closedRequests,
      totalAnswers,
      averageAnswersPerRequest: closedRequests > 0 ? totalAnswers / closedRequests : 0,
    };
  }

  /**
   * Получить сделки по контрагенту для RAG контекста
   * Позволяет AI понять коммерческую историю клиента
   */
  async getDealsByCounterpartyId(counterpartyId: number): Promise<Array<{
    id: number;
    name: string;
    sum: number;
    stageName?: string;
    createdAt?: Date;
    closedAt?: Date;
    isClosed: boolean;
  }>> {
    if (!this.isAvailable() || !counterpartyId) {
      return [];
    }

    try {
      const deals = await this.dealRepository
        .createQueryBuilder('deal')
        .where('deal.counterparty_id = :counterpartyId', { counterpartyId })
        .orderBy('deal.created_at', 'DESC')
        .take(10) // Последние 10 сделок
        .getMany();

      // Получаем стадии сделок
      const stageIds = [...new Set(deals.map(d => d.dealStageId).filter(Boolean))];
      const stages = stageIds.length > 0
        ? await this.dealStageRepository.find({
            where: stageIds.map(id => ({ id })),
          })
        : [];
      const stageMap = new Map(stages.map(s => [s.id, s]));

      return deals.map(deal => ({
        id: deal.id,
        name: deal.name || `Сделка #${deal.id}`,
        sum: Number(deal.sum),
        stageName: deal.dealStageId ? stageMap.get(deal.dealStageId)?.name : undefined,
        createdAt: deal.createdAt,
        closedAt: deal.closedAt ?? undefined,
        isClosed: deal.isClosed,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Получить продукты из сделки (если есть связь deal_product)
   * Fallback: возвращает пустой массив если таблицы нет
   */
  async getProductsByDealId(dealId: number): Promise<Array<{
    id: number;
    name: string;
    code?: string;
    quantity?: number;
  }>> {
    if (!this.isAvailable() || !dealId) {
      return [];
    }

    // В legacy системе связь сделка-продукт через таблицу deal_product
    // Пробуем получить через raw query, так как entity может не быть
    try {
      const results = await this.legacyDataSource.query(`
        SELECT p.productID as id, p.name, p.product_code as code, dp.quantity
        FROM deal_product dp
        JOIN SS_products p ON dp.product_id = p.productID
        WHERE dp.deal_id = ?
        LIMIT 20
      `, [dealId]);

      return results.map((row: { id: number; name: string; code?: string; quantity?: number }) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        quantity: row.quantity,
      }));
    } catch {
      // Таблица может не существовать
      return [];
    }
  }

  /**
   * Получить контрагента по ID клиента
   */
  async getCounterpartyByCustomerId(customerId: number): Promise<{
    id: number;
    name: string;
    inn?: string;
    address?: string;
  } | null> {
    if (!this.isAvailable() || !customerId) {
      return null;
    }

    try {
      const customer = await this.customerRepository.findOne({
        where: { id: customerId },
      });

      if (!customer?.defaultCounterpartyId) {
        return null;
      }

      const counterparty = await this.counterpartyRepository.findOne({
        where: { id: customer.defaultCounterpartyId },
      });

      if (!counterparty) {
        return null;
      }

      return {
        id: counterparty.id,
        name: counterparty.name,
        inn: counterparty.inn || undefined,
        address: counterparty.address || undefined,
      };
    } catch {
      return null;
    }
  }
}
