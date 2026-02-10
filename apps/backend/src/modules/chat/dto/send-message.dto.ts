import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageAttachmentDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  size: number;

  @IsString()
  key: string;

  @IsString()
  mimeType: string;

  @IsString()
  @IsOptional()
  thumbnailKey?: string;
}

export class SendMessageDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsIn(['text', 'voice'])
  @IsOptional()
  type?: 'text' | 'voice' = 'text';

  @IsString()
  @IsOptional()
  replyToId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  @IsOptional()
  attachments?: MessageAttachmentDto[];

  @IsString()
  @IsOptional()
  voiceKey?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  voiceDuration?: number;

  @IsArray()
  @IsOptional()
  voiceWaveform?: number[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mentionedUserIds?: string[];
}
