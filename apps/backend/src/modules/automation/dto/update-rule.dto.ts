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

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TriggerType)
  trigger?: TriggerType;

  @IsOptional()
  triggerConfig?: {
    fromStatus?: string | string[];
    toStatus?: string | string[];
    fieldId?: string;
  };

  @IsOptional()
  @IsArray()
  conditions?: RuleCondition[];

  @IsOptional()
  @IsArray()
  actions?: RuleAction[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}
