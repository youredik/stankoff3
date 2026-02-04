import { IsString, IsEnum, IsOptional } from 'class-validator';
import { SectionRole } from '../section-member.entity';

export class AddSectionMemberDto {
  @IsString()
  userId: string;

  @IsEnum(SectionRole)
  @IsOptional()
  role?: SectionRole;
}
