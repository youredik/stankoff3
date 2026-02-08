import { LegacyManager } from '../entities/legacy-manager.entity';
import { LegacyCustomer } from '../entities/legacy-customer.entity';
import { LegacyDepartment } from '../entities/legacy-department.entity';

/**
 * DTO для сотрудника из legacy системы
 * Объединяет данные из manager + SS_customers + department
 */
export class LegacyEmployeeDto {
  id: number; // manager.id
  userId: number; // SS_customers.customerID
  alias: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  departmentId: number | null;
  departmentName: string | null;
  isActive: boolean;
  isOnVacation: boolean;
  canAcceptRequests: boolean;
  canSale: boolean;
  telegramId: string | null;

  static fromEntities(
    manager: LegacyManager,
    customer?: LegacyCustomer,
    department?: LegacyDepartment,
  ): LegacyEmployeeDto {
    const dto = new LegacyEmployeeDto();
    dto.id = manager.id;
    dto.userId = manager.userId;
    dto.alias = manager.alias;
    dto.firstName = customer?.firstName ?? null;
    dto.lastName = customer?.lastName ?? null;
    dto.displayName = customer?.displayName ?? `@${manager.alias}`;
    dto.email = customer?.email ?? null;
    dto.phone = customer?.phone ?? null;
    dto.departmentId = manager.departmentId;
    dto.departmentName = department?.title ?? null;
    dto.isActive = manager.isActive;
    dto.isOnVacation = manager.isOnVacation;
    dto.canAcceptRequests = manager.canAcceptRequests;
    dto.canSale = manager.canSale === 1;
    dto.telegramId = manager.telegramId;
    return dto;
  }
}

/**
 * DTO для результатов поиска сотрудников
 */
export class LegacyEmployeeSearchResultDto {
  items: LegacyEmployeeDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * DTO для отдела
 */
export class LegacyDepartmentDto {
  id: number;
  alias: string | null;
  title: string | null;
  phoneNumber: string | null;
  employeesCount?: number;

  static fromEntity(entity: LegacyDepartment): LegacyDepartmentDto {
    const dto = new LegacyDepartmentDto();
    dto.id = entity.id;
    dto.alias = entity.alias;
    dto.title = entity.title;
    dto.phoneNumber = entity.phoneNumber;
    return dto;
  }
}
