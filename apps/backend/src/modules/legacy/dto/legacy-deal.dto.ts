import { LegacyDeal } from '../entities/legacy-deal.entity';
import { LegacyDealStage } from '../entities/legacy-deal-stage.entity';
import { LegacyCounterparty } from '../entities/legacy-counterparty.entity';

/**
 * DTO для сделки из legacy системы
 */
export class LegacyDealDto {
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
  createdAt: Date | null;
  updatedAt: Date | null;
  closedAt: Date | null;
  expectedCloseDate: Date | null;

  static fromEntity(
    entity: LegacyDeal,
    stage?: LegacyDealStage,
    counterparty?: LegacyCounterparty,
  ): LegacyDealDto {
    const dto = new LegacyDealDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.sum = Number(entity.sum);
    dto.formattedSum = entity.formattedSum;
    dto.counterpartyId = entity.counterpartyId;
    dto.counterpartyName = counterparty?.name;
    dto.employeeUserId = entity.employeeUserId;
    dto.dealStageId = entity.dealStageId;
    dto.stageName = stage?.name;
    dto.stageColor = stage?.color;
    dto.funnelId = entity.funnelId;
    dto.comment = entity.comment;
    dto.isClosed = entity.isClosed;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.closedAt = entity.closedAt;
    dto.expectedCloseDate = entity.expectedCloseDate;
    return dto;
  }
}

/**
 * DTO для результатов поиска сделок
 */
export class LegacyDealSearchResultDto {
  items: LegacyDealDto[];
  total: number;
  limit: number;
  offset: number;
}
