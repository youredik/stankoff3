import { IsArray, IsString } from 'class-validator';

export class AddParticipantsDto {
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}
