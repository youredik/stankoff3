import { LegacyCustomer } from '../entities/legacy-customer.entity';

/**
 * DTO для клиента из legacy системы
 */
export class LegacyCustomerDto {
  id: number;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  isEmployee: boolean;
  defaultCounterpartyId: number;
  registrationDate: Date | null;

  static fromEntity(entity: LegacyCustomer): LegacyCustomerDto {
    const dto = new LegacyCustomerDto();
    dto.id = entity.id;
    dto.firstName = entity.firstName;
    dto.lastName = entity.lastName;
    dto.displayName = entity.displayName;
    dto.email = entity.email;
    dto.phone = entity.phone;
    dto.isEmployee = entity.isEmployee;
    dto.defaultCounterpartyId = entity.defaultCounterpartyId;
    dto.registrationDate = entity.registrationDate;
    return dto;
  }
}

/**
 * DTO для результатов поиска клиентов
 */
export class LegacyCustomerSearchResultDto {
  items: LegacyCustomerDto[];
  total: number;
  limit: number;
  offset: number;
}
