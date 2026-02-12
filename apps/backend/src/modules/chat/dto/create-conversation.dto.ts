import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
} from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsIn(['direct', 'group', 'entity', 'ai_assistant'])
  type: 'direct' | 'group' | 'entity' | 'ai_assistant';

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsArray()
  @IsString({ each: true })
  participantIds: string[];
}
