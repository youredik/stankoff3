import { IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInvitationDto } from './create-invitation.dto';

export class BulkInviteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvitationDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  invitations: CreateInvitationDto[];
}
