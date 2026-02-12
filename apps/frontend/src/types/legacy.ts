// Типы для Legacy CRM интеграции (read-only)

// ==================== Клиенты ====================

export interface LegacyCustomer {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  isEmployee: boolean;
  defaultCounterpartyId: number;
  registrationDate: string | null;
}

export interface LegacyCustomerSearchResult {
  items: LegacyCustomer[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Товары ====================

export interface LegacyProduct {
  id: number;
  name: string;
  uri: string | null;
  price: number;
  categoryId: number;
  categoryName?: string;
  supplierId: number | null;
  productCode: string | null;
  factoryName: string | null;
  briefDescription: string | null;
  isInStock: boolean;
  inStock: number;
}

export interface LegacyProductSearchResult {
  items: LegacyProduct[];
  total: number;
  limit: number;
  offset: number;
}

export interface LegacyCategory {
  id: number;
  name: string;
  uri: string | null;
  parentId: number | null;
}

// ==================== Контрагенты ====================

export interface LegacyCounterparty {
  id: number;
  name: string;
  inn: string | null;
  kpp: string | null;
  legalAddress: string | null;
  actualAddress: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  createdAt: string | null;
}

export interface LegacyCounterpartySearchResult {
  items: LegacyCounterparty[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Сделки ====================

export interface LegacyDeal {
  id: number;
  name: string | null;
  sum: number;
  formattedSum: string;
  counterpartyId: number | null;
  counterpartyName?: string;
  employeeUserId: number | null;
  dealStageId: number | null;
  stageName?: string;
  stageColor?: string;
  funnelId: number;
  comment: string | null;
  isClosed: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  expectedCloseDate: string | null;
}

export interface LegacyDealSearchResult {
  items: LegacyDeal[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Сотрудники ====================

export interface LegacyEmployee {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  departmentId: number | null;
  departmentName?: string;
  position: string | null;
  isActive: boolean;
}

export interface LegacyEmployeeSearchResult {
  items: LegacyEmployee[];
  total: number;
  limit: number;
  offset: number;
}

export interface LegacyDepartment {
  id: number;
  name: string;
  parentId: number | null;
}

// ==================== Опции поиска ====================

export interface LegacySearchOptions {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface LegacyCustomerSearchOptions extends LegacySearchOptions {
  employeesOnly?: boolean;
}

export interface LegacyProductSearchOptions extends LegacySearchOptions {
  categoryId?: number;
  inStockOnly?: boolean;
}

export interface LegacyDealSearchOptions {
  counterpartyId?: number;
  employeeUserId?: number;
  limit?: number;
  offset?: number;
}

export interface LegacyEmployeeSearchOptions extends LegacySearchOptions {
  activeOnly?: boolean;
  departmentId?: number;
}

// ==================== Health Check ====================

export interface LegacyHealthStatus {
  available: boolean;
  message: string;
}
