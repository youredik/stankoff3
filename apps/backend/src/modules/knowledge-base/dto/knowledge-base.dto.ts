import { IsString, IsOptional, IsUUID, IsArray, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFaqDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class ArticleFilterDto {
  @IsOptional()
  @IsIn(['document', 'faq'])
  type?: 'document' | 'faq';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  perPage?: number;
}
