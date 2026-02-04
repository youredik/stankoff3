import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import {
  TriggerType,
  RuleCondition,
  RuleAction,
} from '../automation-rule.entity';

export class CreateAutomationRuleDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  workspaceId: string;

  @IsEnum(TriggerType)
  trigger: TriggerType;

  @IsOptional()
  triggerConfig?: {
    fromStatus?: string | string[];
    toStatus?: string | string[];
    fieldId?: string;
  };

  @IsOptional()
  @IsArray()
  conditions?: RuleCondition[];

  @IsArray()
  actions: RuleAction[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}
