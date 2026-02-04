import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { SectionService } from './section.service';
import { Section } from './section.entity';
import { SectionRole } from './section-member.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../user/user.entity';
import {
  CreateSectionDto,
  UpdateSectionDto,
  AddSectionMemberDto,
  UpdateSectionMemberDto,
} from './dto';

@Controller('sections')
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Get()
  async findAll(@CurrentUser() user: User): Promise<Section[]> {
    return this.sectionService.findAll(user.id, user.role);
  }

  // Получить роли текущего пользователя во всех разделах
  @Get('my-roles')
  async getMyRoles(
    @CurrentUser() user: User,
  ): Promise<Record<string, SectionRole>> {
    return this.sectionService.getMyRoles(user.id, user.role);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<Section | null> {
    const access = await this.sectionService.checkAccess(id, user.id, user.role);
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому разделу');
    }
    return this.sectionService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @Body() dto: CreateSectionDto,
    @CurrentUser() user: User,
  ): Promise<Section> {
    return this.sectionService.create(dto, user.id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: User,
  ): Promise<Section | null> {
    const access = await this.sectionService.checkAccess(
      id,
      user.id,
      user.role,
      SectionRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для редактирования раздела');
    }
    return this.sectionService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<void> {
    return this.sectionService.remove(id);
  }

  // Изменить порядок разделов
  @Post('reorder')
  @Roles(UserRole.ADMIN)
  async reorder(@Body() body: { sectionIds: string[] }): Promise<void> {
    return this.sectionService.reorder(body.sectionIds);
  }

  // === Управление участниками ===

  @Get(':id/members')
  async getMembers(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const access = await this.sectionService.checkAccess(id, user.id, user.role);
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому разделу');
    }
    return this.sectionService.getMembers(id);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddSectionMemberDto,
    @CurrentUser() user: User,
  ) {
    const access = await this.sectionService.checkAccess(
      id,
      user.id,
      user.role,
      SectionRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для добавления участников');
    }
    return this.sectionService.addMember(id, dto.userId, dto.role);
  }

  @Put(':id/members/:userId')
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateSectionMemberDto,
    @CurrentUser() user: User,
  ) {
    const access = await this.sectionService.checkAccess(
      id,
      user.id,
      user.role,
      SectionRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для изменения роли');
    }
    return this.sectionService.updateMemberRole(id, userId, dto.role);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: User,
  ) {
    const access = await this.sectionService.checkAccess(
      id,
      user.id,
      user.role,
      SectionRole.ADMIN,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для удаления участников');
    }
    return this.sectionService.removeMember(id, userId);
  }
}
