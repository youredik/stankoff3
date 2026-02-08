import { LegacyCounterparty } from '../entities/legacy-counterparty.entity';

/**
 * DTO для контрагента из legacy системы
 */
export class LegacyCounterpartyDto {
  id: number;
  name: string | null;
  shortName: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  director: string | null;
  type: string | null;

  static fromEntity(entity: LegacyCounterparty): LegacyCounterpartyDto {
    const dto = new LegacyCounterpartyDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.shortName = entity.shortName;
    dto.inn = entity.inn;
    dto.kpp = entity.kpp;
    dto.ogrn = entity.ogrn;
    dto.address = entity.address;
    dto.director = entity.director;
    dto.type = entity.type;
    return dto;
  }
}

/**
 * DTO для результатов поиска контрагентов
 */
export class LegacyCounterpartySearchResultDto {
  items: LegacyCounterpartyDto[];
  total: number;
  limit: number;
  offset: number;
}
