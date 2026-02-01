import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateEntityDto {
  @IsString()
  customId: string;

  @IsString()
  workspaceId: string;

  @IsString()
  title: string;

  @IsString()
  status: string;

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
