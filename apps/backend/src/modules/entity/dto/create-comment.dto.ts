import { IsString, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsNumber()
  size: number;

  @IsString()
  key: string;

  @IsString()
  mimeType: string;

  @IsString()
  @IsOptional()
  thumbnailKey?: string;
}

export class CreateCommentDto {
  @IsString()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mentionedUserIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  @IsOptional()
  attachments?: AttachmentDto[];
}
