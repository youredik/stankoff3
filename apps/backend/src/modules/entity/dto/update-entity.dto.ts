import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateEntityDto {
  @IsString()
  @IsOptional()
  title?: string;

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
}
