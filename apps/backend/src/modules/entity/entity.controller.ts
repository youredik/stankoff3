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
  ForbiddenException,
} from '@nestjs/common';
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
}
