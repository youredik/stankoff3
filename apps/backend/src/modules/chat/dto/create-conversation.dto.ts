import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
} from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsIn(['direct', 'group', 'entity'])
  type: 'direct' | 'group' | 'entity';

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
