import {
  IsEmail,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvitationMembershipDto } from './invitation-membership.dto';

export class CreateInvitationDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  globalRoleSlug?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvitationMembershipDto)
  memberships?: InvitationMembershipDto[];
}
