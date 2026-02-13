import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateEntityDto {
  @IsString()
  workspaceId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsString()
  @IsOptional()
  creatorId?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
