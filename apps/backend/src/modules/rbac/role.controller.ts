import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { RbacService } from './rbac.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignGlobalRoleDto } from './dto/assign-role.dto';
import { RequirePermission } from './rbac.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { RoleScope } from './role.entity';
import {
  PERMISSION_REGISTRY,
  getPermissionsByCategory,
  getPermissionsForScope,
} from './permission-registry';

@Controller('rbac')
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    private readonly rbacService: RbacService,
  ) {}

  // ── Roles CRUD ─────────────────────────────────────────────

  @Get('roles')
  @RequirePermission('global:role:manage')
  async findAll(@Query('scope') scope?: RoleScope) {
    return this.roleService.findAll(scope);
  }

  @Get('roles/:id')
  @RequirePermission('global:role:manage')
  async findOne(@Param('id') id: string) {
    return this.roleService.findOne(id);
  }

  @Post('roles')
  @RequirePermission('global:role:manage')
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Put('roles/:id')
  @RequirePermission('global:role:manage')
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('global:role:manage')
  async remove(@Param('id') id: string) {
    await this.roleService.remove(id);
    return { success: true };
  }

  // ── Assign ─────────────────────────────────────────────────

  @Post('assign/global')
  @RequirePermission('global:user:manage')
  async assignGlobalRole(@Body() dto: AssignGlobalRoleDto) {
    return this.roleService.assignGlobalRole(dto.userId, dto.roleId);
  }

  // ── Permissions registry ───────────────────────────────────

  @Get('permissions')
  async getPermissions(@Query('scope') scope?: RoleScope) {
    if (scope) {
      return getPermissionsForScope(scope);
    }
    return PERMISSION_REGISTRY;
  }

  @Get('permissions/categories')
  async getPermissionCategories() {
    return getPermissionsByCategory();
  }

  // ── My permissions ─────────────────────────────────────────

  @Get('permissions/my')
  async getMyPermissions(
    @CurrentUser() user: User,
    @Query('workspaceId') workspaceId?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    const permissions = await this.rbacService.getEffectivePermissions(user.id, {
      workspaceId,
      sectionId,
    });
    return { permissions: Array.from(permissions) };
  }

  @Get('permissions/my/workspaces')
  async getMyWorkspacePermissions(@CurrentUser() user: User) {
    const workspaceIds = await this.rbacService.getAccessibleWorkspaceIds(user.id);
    const result: Record<string, string[]> = {};

    for (const wsId of workspaceIds) {
      const perms = await this.rbacService.getEffectivePermissions(user.id, {
        workspaceId: wsId,
      });
      result[wsId] = Array.from(perms);
    }

    return result;
  }
}
