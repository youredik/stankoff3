import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class UpdateEntityDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  linkedEntityIds?: string[];
}
