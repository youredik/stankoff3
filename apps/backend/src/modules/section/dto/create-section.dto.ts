import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateSectionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  order?: number;
}
