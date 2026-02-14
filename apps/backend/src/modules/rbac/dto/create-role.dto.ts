import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { RoleScope } from '../role.entity';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'slug должен содержать только строчные буквы, цифры и подчёркивания',
  })
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['global', 'section', 'workspace'])
  scope: RoleScope;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
