import { IsString, IsUUID, IsOptional, IsNumber, IsBoolean, IsObject, IsArray, IsIn, Min, Max } from 'class-validator';
import { SlaTargetType, SlaConditions, BusinessHours, EscalationRule } from '../entities/sla-definition.entity';

export class CreateSlaDefinitionDto {
  @IsUUID()
  workspaceId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['entity', 'task', 'process'])
  appliesTo: SlaTargetType;

  @IsOptional()
  @IsObject()
  conditions?: SlaConditions;

  @IsOptional()
  @IsNumber()
  @Min(1)
  responseTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  resolutionTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  warningThreshold?: number;

  @IsOptional()
  @IsBoolean()
  businessHoursOnly?: boolean;

  @IsOptional()
  @IsObject()
  businessHours?: BusinessHours;

  @IsOptional()
  @IsArray()
  escalationRules?: EscalationRule[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class UpdateSlaDefinitionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  conditions?: SlaConditions;

  @IsOptional()
  @IsNumber()
  @Min(1)
  responseTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  resolutionTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  warningThreshold?: number;

  @IsOptional()
  @IsBoolean()
  businessHoursOnly?: boolean;

  @IsOptional()
  @IsObject()
  businessHours?: BusinessHours;

  @IsOptional()
  @IsArray()
  escalationRules?: EscalationRule[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}
