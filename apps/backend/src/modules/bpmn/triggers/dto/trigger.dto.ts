import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  MaxLength,
} from 'class-validator';
import { TriggerType, TriggerConditions, VariableMappings } from '../../entities/process-trigger.entity';

export class CreateTriggerDto {
  @IsUUID()
  processDefinitionId: string;

  @IsUUID()
  workspaceId: string;

  @IsEnum(TriggerType)
  triggerType: TriggerType;

  @IsOptional()
  @IsObject()
  conditions?: TriggerConditions;

  @IsOptional()
  @IsObject()
  variableMappings?: VariableMappings;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTriggerDto {
  @IsOptional()
  @IsEnum(TriggerType)
  triggerType?: TriggerType;

  @IsOptional()
  @IsObject()
  conditions?: TriggerConditions;

  @IsOptional()
  @IsObject()
  variableMappings?: VariableMappings;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
