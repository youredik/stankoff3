import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { LegacyService } from './services/legacy.service';
import {
  LegacyCustomerSearchResultDto,
  LegacyCustomerDto,
  LegacyProductSearchResultDto,
  LegacyProductDto,
  LegacyCounterpartySearchResultDto,
  LegacyCounterpartyDto,
  LegacyDealSearchResultDto,
  LegacyDealDto,
  LegacyEmployeeSearchResultDto,
  LegacyEmployeeDto,
  LegacyDepartmentDto,
} from './dto';
import { LegacyCategory } from './entities';

/**
 * Контроллер для работы с Legacy данными
 * Предоставляет READ-ONLY API для доступа к данным старой системы
 *
 * @Public() на уровне класса - все эндпоинты доступны без авторизации
 * TODO: В продакшене пересмотреть политику доступа
 */
@Public()
@Controller('legacy')
export class LegacyController {
  constructor(private readonly legacyService: LegacyService) {}

  // ==================== HEALTH CHECK ====================

  /**
   * Проверка доступности legacy БД
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): { available: boolean; message: string } {
    const available = this.legacyService.isAvailable();
    return {
      available,
      message: available ? 'Legacy database is connected' : 'Legacy database is not available',
    };
  }

  // ==================== CUSTOMERS ====================

  /**
   * Поиск клиентов
   * GET /api/legacy/customers/search?q=текст&limit=10&offset=0&employeesOnly=false
   */
  @Get('customers/search')
  async searchCustomers(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('employeesOnly') employeesOnly?: string,
  ): Promise<LegacyCustomerSearchResultDto> {
    return this.legacyService.searchCustomers(query || '', {
      limit: limit ? parseInt(limit, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0,
      employeesOnly: employeesOnly === 'true',
    });
  }

  /**
   * Получить клиента по ID
   * GET /api/legacy/customers/:id
   */
  @Get('customers/:id')
  async getCustomer(@Param('id', ParseIntPipe) id: number): Promise<LegacyCustomerDto> {
    const customer = await this.legacyService.getCustomerById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  // ==================== PRODUCTS ====================

  /**
   * Поиск товаров
   * GET /api/legacy/products/search?q=текст&limit=10&offset=0&categoryId=123&inStockOnly=false
   */
  @Get('products/search')
  async searchProducts(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('categoryId') categoryId?: string,
    @Query('inStockOnly') inStockOnly?: string,
  ): Promise<LegacyProductSearchResultDto> {
    return this.legacyService.searchProducts(query || '', {
      limit: limit ? parseInt(limit, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0,
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      inStockOnly: inStockOnly === 'true',
    });
  }

  /**
   * Получить товар по ID
   * GET /api/legacy/products/:id
   */
  @Get('products/:id')
  async getProduct(@Param('id', ParseIntPipe) id: number): Promise<LegacyProductDto> {
    const product = await this.legacyService.getProductById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  /**
   * Получить все категории товаров
   * GET /api/legacy/categories
   */
  @Get('categories')
  async getCategories(): Promise<LegacyCategory[]> {
    return this.legacyService.getCategories();
  }

  // ==================== COUNTERPARTIES ====================

  /**
   * Поиск контрагентов
   * GET /api/legacy/counterparties/search?q=текст&limit=10&offset=0
   */
  @Get('counterparties/search')
  async searchCounterparties(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<LegacyCounterpartySearchResultDto> {
    return this.legacyService.searchCounterparties(query || '', {
      limit: limit ? parseInt(limit, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Получить контрагента по ID
   * GET /api/legacy/counterparties/:id
   */
  @Get('counterparties/:id')
  async getCounterparty(@Param('id', ParseIntPipe) id: number): Promise<LegacyCounterpartyDto> {
    const counterparty = await this.legacyService.getCounterpartyById(id);
    if (!counterparty) {
      throw new NotFoundException(`Counterparty with ID ${id} not found`);
    }
    return counterparty;
  }

  // ==================== DEALS ====================

  /**
   * Поиск сделок
   * GET /api/legacy/deals?counterpartyId=123&employeeUserId=456&limit=10&offset=0
   */
  @Get('deals')
  async searchDeals(
    @Query('counterpartyId') counterpartyId?: string,
    @Query('employeeUserId') employeeUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<LegacyDealSearchResultDto> {
    return this.legacyService.searchDeals({
      counterpartyId: counterpartyId ? parseInt(counterpartyId, 10) : undefined,
      employeeUserId: employeeUserId ? parseInt(employeeUserId, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Получить сделку по ID
   * GET /api/legacy/deals/:id
   */
  @Get('deals/:id')
  async getDeal(@Param('id', ParseIntPipe) id: number): Promise<LegacyDealDto> {
    const deal = await this.legacyService.getDealById(id);
    if (!deal) {
      throw new NotFoundException(`Deal with ID ${id} not found`);
    }
    return deal;
  }

  // ==================== EMPLOYEES (Сотрудники) ====================

  /**
   * Поиск сотрудников
   * GET /api/legacy/employees/search?q=текст&limit=10&offset=0&activeOnly=true&departmentId=3
   */
  @Get('employees/search')
  async searchEmployees(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('departmentId') departmentId?: string,
  ): Promise<LegacyEmployeeSearchResultDto> {
    return this.legacyService.searchEmployees(query || '', {
      limit: limit ? parseInt(limit, 10) : 10,
      offset: offset ? parseInt(offset, 10) : 0,
      activeOnly: activeOnly !== 'false',
      departmentId: departmentId ? parseInt(departmentId, 10) : undefined,
    });
  }

  /**
   * Получить всех активных сотрудников (для импорта)
   * GET /api/legacy/employees/all
   */
  @Get('employees/all')
  async getAllActiveEmployees(): Promise<LegacyEmployeeDto[]> {
    return this.legacyService.getAllActiveEmployees();
  }

  /**
   * Получить сотрудника по ID
   * GET /api/legacy/employees/:id
   */
  @Get('employees/:id')
  async getEmployee(@Param('id', ParseIntPipe) id: number): Promise<LegacyEmployeeDto> {
    const employee = await this.legacyService.getEmployeeById(id);
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    return employee;
  }

  /**
   * Получить список отделов
   * GET /api/legacy/departments
   */
  @Get('departments')
  async getDepartments(): Promise<LegacyDepartmentDto[]> {
    return this.legacyService.getDepartments();
  }
}
