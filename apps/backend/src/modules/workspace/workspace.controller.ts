import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { Workspace } from './workspace.entity';
import { WorkspaceRole } from './workspace-member.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../user/user.entity';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  async findAll(@CurrentUser() user: User): Promise<Workspace[]> {
    return this.workspaceService.findAll(user.id, user.role);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Workspace | null> {
    const access = await this.workspaceService.checkAccess(id, user.id, user.role);
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому рабочему месту');
    }
    return this.workspaceService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @Body() workspaceData: Partial<Workspace>,
    @CurrentUser() user: User,
  ): Promise<Workspace> {
    return this.workspaceService.create(workspaceData, user.id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() workspaceData: Partial<Workspace>,
  ): Promise<Workspace | null> {
    return this.workspaceService.update(id, workspaceData);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<void> {
    return this.workspaceService.remove(id);
  }

  // Получить роль текущего пользователя в workspace
  @Get(':id/my-role')
  async getMyRole(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ role: WorkspaceRole | null }> {
    const access = await this.workspaceService.checkAccess(id, user.id, user.role);
    return { role: access?.role || null };
  }

  // === Управление участниками ===

  @Get(':id/members')
  async getMembers(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const access = await this.workspaceService.checkAccess(id, user.id, user.role);
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому рабочему месту');
    }
    return this.workspaceService.getMembers(id);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role?: WorkspaceRole },
    @CurrentUser() user: User,
  ) {
    // Нужен admin workspace или глобальный admin
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для добавления участников');
    }
    return this.workspaceService.addMember(id, body.userId, body.role);
  }

  @Put(':id/members/:userId')
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: WorkspaceRole },
    @CurrentUser() user: User,
  ) {
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для изменения роли');
    }
    return this.workspaceService.updateMemberRole(id, userId, body.role);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: User,
  ) {
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для удаления участников');
    }
    return this.workspaceService.removeMember(id, userId);
  }
}
