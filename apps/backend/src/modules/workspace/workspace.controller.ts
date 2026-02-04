import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
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

  // Получить роли текущего пользователя во всех workspace
  @Get('my-roles')
  async getMyRoles(
    @CurrentUser() user: User,
  ): Promise<Record<string, WorkspaceRole>> {
    return this.workspaceService.getMyRoles(user.id, user.role);
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

  // === Дублирование, архивирование, экспорт ===

  @Post(':id/duplicate')
  @Roles(UserRole.ADMIN)
  async duplicate(
    @Param('id') id: string,
    @Body() body: { name?: string },
    @CurrentUser() user: User,
  ): Promise<Workspace> {
    return this.workspaceService.duplicate(id, user.id, body.name);
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  async setArchived(
    @Param('id') id: string,
    @Body() body: { isArchived: boolean },
  ): Promise<Workspace> {
    return this.workspaceService.setArchived(id, body.isArchived);
  }

  @Patch(':id/section')
  @Roles(UserRole.ADMIN)
  async setSection(
    @Param('id') id: string,
    @Body() body: { sectionId: string | null },
  ): Promise<Workspace> {
    return this.workspaceService.setSection(id, body.sectionId);
  }

  @Patch(':id/show-in-menu')
  @Roles(UserRole.ADMIN)
  async setShowInMenu(
    @Param('id') id: string,
    @Body() body: { showInMenu: boolean },
  ): Promise<Workspace> {
    return this.workspaceService.setShowInMenu(id, body.showInMenu);
  }

  @Post('reorder')
  @Roles(UserRole.ADMIN)
  async reorder(@Body() body: { workspaceIds: string[] }): Promise<void> {
    return this.workspaceService.reorderInSection(body.workspaceIds);
  }

  @Get(':id/export/json')
  async exportJson(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для экспорта');
    }

    const data = await this.workspaceService.exportToJson(id);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${data.workspace.prefix}-export.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  }

  @Get(':id/export/csv')
  async exportCsv(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для экспорта');
    }

    const workspace = await this.workspaceService.findOne(id);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    const csv = await this.workspaceService.exportToCsv(id);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${workspace.prefix}-export.csv"`,
    );
    // BOM для корректного открытия в Excel
    res.send('\uFEFF' + csv);
  }

  // === Импорт ===

  @Post(':id/import/json')
  async importJson(
    @Param('id') id: string,
    @Body() body: { entities: any[] },
    @CurrentUser() user: User,
  ) {
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для импорта');
    }
    return this.workspaceService.importFromJson(id, body.entities, user.id);
  }

  @Post(':id/import/csv')
  async importCsv(
    @Param('id') id: string,
    @Body() body: { csv: string },
    @CurrentUser() user: User,
  ) {
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для импорта');
    }
    return this.workspaceService.importFromCsv(id, body.csv, user.id);
  }
}
