import { IsEnum } from 'class-validator';
import { SectionRole } from '../section-member.entity';

export class UpdateSectionMemberDto {
  @IsEnum(SectionRole)
  role: SectionRole;
}
