import { IsOptional, IsBoolean, IsNumber, Min, IsString } from 'class-validator';

export class StartMigrationDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  batchSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRequests?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class MigrationLogQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}
