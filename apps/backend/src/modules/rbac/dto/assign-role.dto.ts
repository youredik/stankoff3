import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class AssignGlobalRoleDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  roleId: string;
}
