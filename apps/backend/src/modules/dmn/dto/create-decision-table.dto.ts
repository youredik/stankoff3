import { IsString, IsUUID, IsOptional, IsArray, IsBoolean, IsEnum, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { HitPolicy, InputColumn, OutputColumn, DecisionRule } from '../entities/decision-table.entity';

export class CreateDecisionTableDto {
  @IsUUID()
  workspaceId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['UNIQUE', 'FIRST', 'ANY', 'COLLECT', 'RULE_ORDER'])
  hitPolicy?: HitPolicy;

  @IsArray()
  inputColumns: InputColumn[];

  @IsArray()
  outputColumns: OutputColumn[];

  @IsOptional()
  @IsArray()
  rules?: DecisionRule[];
}

export class UpdateDecisionTableDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['UNIQUE', 'FIRST', 'ANY', 'COLLECT', 'RULE_ORDER'])
  hitPolicy?: HitPolicy;

  @IsOptional()
  @IsArray()
  inputColumns?: InputColumn[];

  @IsOptional()
  @IsArray()
  outputColumns?: OutputColumn[];

  @IsOptional()
  @IsArray()
  rules?: DecisionRule[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EvaluateDecisionDto {
  @IsUUID()
  decisionTableId: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  inputData: Record<string, unknown>;

  @IsOptional()
  @IsString()
  triggeredBy?: string;
}
