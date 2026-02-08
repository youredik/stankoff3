import { apiClient } from './client';
import type {
  LegacyHealthStatus,
  LegacyCustomer,
  LegacyCustomerSearchResult,
  LegacyCustomerSearchOptions,
  LegacyProduct,
  LegacyProductSearchResult,
  LegacyProductSearchOptions,
  LegacyCategory,
  LegacyCounterparty,
  LegacyCounterpartySearchResult,
  LegacyDeal,
  LegacyDealSearchResult,
  LegacyDealSearchOptions,
  LegacyEmployee,
  LegacyEmployeeSearchResult,
  LegacyEmployeeSearchOptions,
  LegacyDepartment,
  LegacySearchOptions,
} from '@/types/legacy';

/**
 * API клиент для работы с Legacy CRM (read-only)
 */
export const legacyApi = {
  // ==================== Health Check ====================

  /**
   * Проверка доступности legacy БД
   */
  getHealth: () =>
    apiClient.get<LegacyHealthStatus>('/legacy/health').then((r) => r.data),

  // ==================== Клиенты ====================

  /**
   * Поиск клиентов
   */
  searchCustomers: (options: LegacyCustomerSearchOptions = {}) => {
    const params = new URLSearchParams();
    if (options.q) params.append('q', options.q);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    if (options.employeesOnly) params.append('employeesOnly', 'true');

    return apiClient
      .get<LegacyCustomerSearchResult>(`/legacy/customers/search?${params}`)
      .then((r) => r.data);
  },

  /**
   * Получить клиента по ID
   */
  getCustomer: (id: number) =>
    apiClient.get<LegacyCustomer>(`/legacy/customers/${id}`).then((r) => r.data),

  // ==================== Товары ====================

  /**
   * Поиск товаров
   */
  searchProducts: (options: LegacyProductSearchOptions = {}) => {
    const params = new URLSearchParams();
    if (options.q) params.append('q', options.q);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    if (options.categoryId) params.append('categoryId', String(options.categoryId));
    if (options.inStockOnly) params.append('inStockOnly', 'true');

    return apiClient
      .get<LegacyProductSearchResult>(`/legacy/products/search?${params}`)
      .then((r) => r.data);
  },

  /**
   * Получить товар по ID
   */
  getProduct: (id: number) =>
    apiClient.get<LegacyProduct>(`/legacy/products/${id}`).then((r) => r.data),

  /**
   * Получить все категории
   */
  getCategories: () =>
    apiClient.get<LegacyCategory[]>('/legacy/categories').then((r) => r.data),

  // ==================== Контрагенты ====================

  /**
   * Поиск контрагентов
   */
  searchCounterparties: (options: LegacySearchOptions = {}) => {
    const params = new URLSearchParams();
    if (options.q) params.append('q', options.q);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));

    return apiClient
      .get<LegacyCounterpartySearchResult>(`/legacy/counterparties/search?${params}`)
      .then((r) => r.data);
  },

  /**
   * Получить контрагента по ID
   */
  getCounterparty: (id: number) =>
    apiClient.get<LegacyCounterparty>(`/legacy/counterparties/${id}`).then((r) => r.data),

  // ==================== Сделки ====================

  /**
   * Поиск сделок
   */
  searchDeals: (options: LegacyDealSearchOptions = {}) => {
    const params = new URLSearchParams();
    if (options.counterpartyId) params.append('counterpartyId', String(options.counterpartyId));
    if (options.employeeUserId) params.append('employeeUserId', String(options.employeeUserId));
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));

    return apiClient
      .get<LegacyDealSearchResult>(`/legacy/deals?${params}`)
      .then((r) => r.data);
  },

  /**
   * Получить сделку по ID
   */
  getDeal: (id: number) =>
    apiClient.get<LegacyDeal>(`/legacy/deals/${id}`).then((r) => r.data),

  // ==================== Сотрудники ====================

  /**
   * Поиск сотрудников
   */
  searchEmployees: (options: LegacyEmployeeSearchOptions = {}) => {
    const params = new URLSearchParams();
    if (options.q) params.append('q', options.q);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    if (options.activeOnly !== undefined) params.append('activeOnly', String(options.activeOnly));
    if (options.departmentId) params.append('departmentId', String(options.departmentId));

    return apiClient
      .get<LegacyEmployeeSearchResult>(`/legacy/employees/search?${params}`)
      .then((r) => r.data);
  },

  /**
   * Получить всех активных сотрудников
   */
  getAllActiveEmployees: () =>
    apiClient.get<LegacyEmployee[]>('/legacy/employees/all').then((r) => r.data),

  /**
   * Получить сотрудника по ID
   */
  getEmployee: (id: number) =>
    apiClient.get<LegacyEmployee>(`/legacy/employees/${id}`).then((r) => r.data),

  /**
   * Получить список отделов
   */
  getDepartments: () =>
    apiClient.get<LegacyDepartment[]>('/legacy/departments').then((r) => r.data),
};

// ==================== URL Helpers ====================

const LEGACY_BASE_URL = 'https://www.stankoff.ru';

/**
 * Генераторы URL для Legacy CRM
 */
export const legacyUrls = {
  customer: (id: number) => `${LEGACY_BASE_URL}/crm/customer/${id}`,
  counterparty: (id: number) => `${LEGACY_BASE_URL}/crm/counterparty/${id}`,
  deal: (id: number) => `${LEGACY_BASE_URL}/crm/deal/${id}`,
  product: (id: number) => `${LEGACY_BASE_URL}/catalog/product/${id}`,
  category: (id: number) => `${LEGACY_BASE_URL}/catalog/category/${id}`,
  request: (id: number) => `${LEGACY_BASE_URL}/crm/request/${id}`,
  manager: (id: number) => `${LEGACY_BASE_URL}/crm/manager/${id}`,
};
