import { IsIn, IsUUID, IsString } from 'class-validator';

export class InvitationMembershipDto {
  @IsIn(['section', 'workspace'])
  type: 'section' | 'workspace';

  @IsUUID()
  targetId: string;

  @IsString()
  roleSlug: string;
}
