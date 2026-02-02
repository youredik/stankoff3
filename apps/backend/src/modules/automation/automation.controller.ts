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
import { AutomationService } from './automation.service';
import { CreateAutomationRuleDto } from './dto/create-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-rule.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceRole } from '../workspace/workspace-member.entity';

@Controller('automation')
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get()
  async findAll(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    if (!workspaceId) {
      throw new ForbiddenException('Не указан workspaceId');
    }

    // Проверяем доступ к workspace (минимум viewer)
    const access = await this.workspaceService.checkAccess(
      workspaceId,
      user.id,
      user.role,
    );
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому рабочему месту');
    }

    return this.automationService.findAll(workspaceId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    const rule = await this.automationService.findOne(id);

    // Проверяем доступ
    const access = await this.workspaceService.checkAccess(
      rule.workspaceId,
      user.id,
      user.role,
    );
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому правилу');
    }

    return rule;
  }

  @Post()
  async create(@Body() dto: CreateAutomationRuleDto, @CurrentUser() user: User) {
    // Только admin workspace может создавать правила
    const access = await this.workspaceService.checkAccess(
      dto.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для создания правил автоматизации');
    }

    return this.automationService.create(dto, user.id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
    @CurrentUser() user: User,
  ) {
    const rule = await this.automationService.findOne(id);

    // Только admin workspace может редактировать правила
    const access = await this.workspaceService.checkAccess(
      rule.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для редактирования правил');
    }

    return this.automationService.update(id, dto);
  }

  @Patch(':id/toggle')
  async toggleActive(@Param('id') id: string, @CurrentUser() user: User) {
    const rule = await this.automationService.findOne(id);

    const access = await this.workspaceService.checkAccess(
      rule.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав');
    }

    return this.automationService.toggleActive(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    const rule = await this.automationService.findOne(id);

    const access = await this.workspaceService.checkAccess(
      rule.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для удаления правил');
    }

    return this.automationService.remove(id);
  }
}
