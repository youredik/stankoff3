import { IsString, IsUUID, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateFormDefinitionDto {
  @IsUUID()
  workspaceId: string;

  @IsString()
  key: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  schema: Record<string, any>;

  @IsOptional()
  @IsObject()
  uiSchema?: Record<string, any>;
}

export class UpdateFormDefinitionDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  schema?: Record<string, any>;

  @IsOptional()
  @IsObject()
  uiSchema?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
