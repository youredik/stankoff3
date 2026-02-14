import { IsString, IsOptional, IsInt, Min, Max, IsIn, Matches, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class TableQueryDto {
  @IsString()
  workspaceId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 25;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_.:-]+$/, { message: 'sortBy must contain only alphanumeric characters, dots, underscores, colons and hyphens' })
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  /** Тип поля для data.* сортировки (number → ::numeric cast) */
  @IsOptional()
  @IsString()
  sortFieldType?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  assigneeId?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  priority?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  status?: string[];

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  customFilters?: string; // JSON-строка: Record<string, any>
}
