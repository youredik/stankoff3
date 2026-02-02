import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Res,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { EntityService } from './entity.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../user/user.entity';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceRole } from '../workspace/workspace-member.entity';

@Controller('entities')
export class EntityController {
  constructor(
    private readonly entityService: EntityService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get()
  async findAll(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    // Проверяем доступ к workspace (viewer+)
    if (workspaceId) {
      const access = await this.workspaceService.checkAccess(
        workspaceId,
        user.id,
        user.role,
      );
      if (!access) {
        throw new ForbiddenException('Нет доступа к этому рабочему месту');
      }
    }
    return this.entityService.findAll(workspaceId);
  }

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('limit') limit: string,
    @CurrentUser() user: User,
  ) {
    if (!query || query.length < 2) {
      return { results: [] };
    }

    // Получаем доступные пользователю workspaces
    const accessibleWorkspaces =
      await this.workspaceService.getAccessibleWorkspaces(user.id, user.role);
    const workspaceIds = accessibleWorkspaces.map((ws) => ws.id);

    if (workspaceIds.length === 0) {
      return { results: [] };
    }

    const { entities, workspaces } = await this.entityService.search(
      query,
      workspaceIds,
      limit ? parseInt(limit, 10) : 10,
    );

    // Формируем результаты с информацией о workspace
    const results = entities.map((entity) => {
      const workspace = workspaces.get(entity.workspaceId);
      return {
        id: entity.id,
        customId: entity.customId,
        title: entity.title,
        status: entity.status,
        priority: entity.priority,
        assignee: entity.assignee,
        workspaceId: entity.workspaceId,
        workspaceName: workspace?.name || '',
        workspaceIcon: workspace?.icon || '',
        createdAt: entity.createdAt,
      };
    });

    return { results };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    const entity = await this.entityService.findOne(id);
    if (entity) {
      const access = await this.workspaceService.checkAccess(
        entity.workspaceId,
        user.id,
        user.role,
      );
      if (!access) {
        throw new ForbiddenException('Нет доступа к этой заявке');
      }
    }
    return entity;
  }

  @Post()
  async create(@Body() dto: CreateEntityDto, @CurrentUser() user: User) {
    // Проверяем доступ к workspace (editor+)
    const access = await this.workspaceService.checkAccess(
      dto.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.EDITOR,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для создания заявок');
    }
    return this.entityService.create(dto, user.id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEntityDto,
    @CurrentUser() user: User,
  ) {
    const entity = await this.entityService.findOne(id);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }
    // Проверяем доступ к workspace (editor+)
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.EDITOR,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для редактирования');
    }
    return this.entityService.update(id, dto, user.id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: User,
  ) {
    const entity = await this.entityService.findOne(id);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }
    // Проверяем доступ к workspace (editor+)
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.EDITOR,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для изменения статуса');
    }
    return this.entityService.updateStatus(id, body.status, user.id);
  }

  @Patch(':id/assignee')
  async updateAssignee(
    @Param('id') id: string,
    @Body() body: { assigneeId: string | null },
    @CurrentUser() user: User,
  ) {
    const entity = await this.entityService.findOne(id);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }
    // Проверяем доступ к workspace (editor+)
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.EDITOR,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для назначения исполнителя');
    }
    return this.entityService.updateAssignee(id, body.assigneeId, user.id);
  }

  @Delete('cleanup/test-data')
  @Roles(UserRole.ADMIN)
  removeTestData() {
    return this.entityService.removeTestData();
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    const entity = await this.entityService.findOne(id);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }
    // Проверяем доступ к workspace (admin)
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для удаления');
    }
    return this.entityService.remove(id, user.id);
  }

  // ==================== Export / Import ====================

  @Get('export/csv')
  async exportToCsv(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (!workspaceId) {
      throw new ForbiddenException('Не указан workspaceId');
    }

    const access = await this.workspaceService.checkAccess(
      workspaceId,
      user.id,
      user.role,
    );
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому рабочему месту');
    }

    const csv = await this.entityService.exportToCsv(workspaceId);
    const filename = `export-${workspaceId}-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM для корректного отображения в Excel
  }

  @Get('export/json')
  async exportToJson(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (!workspaceId) {
      throw new ForbiddenException('Не указан workspaceId');
    }

    const access = await this.workspaceService.checkAccess(
      workspaceId,
      user.id,
      user.role,
    );
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому рабочему месту');
    }

    const data = await this.entityService.exportToJson(workspaceId);
    const filename = `export-${workspaceId}-${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }

  @Post('import/csv')
  @UseInterceptors(FileInterceptor('file'))
  async importFromCsv(
    @Query('workspaceId') workspaceId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (!workspaceId) {
      throw new ForbiddenException('Не указан workspaceId');
    }

    const access = await this.workspaceService.checkAccess(
      workspaceId,
      user.id,
      user.role,
      WorkspaceRole.EDITOR,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для импорта');
    }

    if (!file) {
      throw new ForbiddenException('Файл не загружен');
    }

    const csv = file.buffer.toString('utf-8');
    return this.entityService.importFromCsv(workspaceId, csv, user.id);
  }
}
