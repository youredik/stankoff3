import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  size: number;

  @IsString()
  url: string;

  @IsString()
  mimeType: string;
}

export class CreateCommentDto {
  @IsString()
  authorId: string;

  @IsString()
  content: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  @IsOptional()
  attachments?: AttachmentDto[];
}
