import { IsString, IsOptional, MaxLength, IsObject, ValidateNested, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  taskReminder?: boolean;

  @IsOptional()
  @IsBoolean()
  taskOverdue?: boolean;

  @IsOptional()
  @IsBoolean()
  entityCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  commentReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  mentionReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  statusChanged?: boolean;

  @IsOptional()
  @IsBoolean()
  slaWarning?: boolean;

  @IsOptional()
  @IsBoolean()
  slaBreach?: boolean;

  @IsOptional()
  @IsBoolean()
  aiSuggestion?: boolean;

  @IsOptional()
  @IsBoolean()
  chatMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  dndEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  dndStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  dndEndHour?: number;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notificationPreferences?: NotificationPreferencesDto;
}
