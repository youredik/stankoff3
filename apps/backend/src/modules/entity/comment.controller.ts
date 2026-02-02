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
import { CommentService } from './comment.service';
import { EntityService } from './entity.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceRole } from '../workspace/workspace-member.entity';

@Controller('comments')
export class CommentController {
  constructor(
    private readonly commentService: CommentService,
    private readonly entityService: EntityService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get('entity/:entityId')
  async findByEntityParam(
    @Param('entityId') entityId: string,
    @CurrentUser() user: User,
  ) {
    // Проверяем доступ к workspace через entity (viewer+)
    const entity = await this.entityService.findOne(entityId);
    if (entity) {
      const access = await this.workspaceService.checkAccess(
        entity.workspaceId,
        user.id,
        user.role,
      );
      if (!access) {
        throw new ForbiddenException('Нет доступа к комментариям');
      }
    }
    return this.commentService.findByEntity(entityId);
  }

  @Post('entity/:entityId')
  async create(
    @Param('entityId') entityId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    // Проверяем доступ к workspace (editor+)
    const entity = await this.entityService.findOne(entityId);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.EDITOR,
    );
    if (!access) {
      throw new ForbiddenException('Недостаточно прав для создания комментариев');
    }
    return this.commentService.create(entityId, dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { content: string },
    @CurrentUser() user: User,
  ) {
    // Получаем комментарий и проверяем авторство или admin права
    const comment = await this.commentService.findOne(id);
    if (!comment) {
      throw new ForbiddenException('Комментарий не найден');
    }

    const entity = await this.entityService.findOne(comment.entityId);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }

    // Автор может редактировать свой комментарий, admin workspace - любой
    const isAuthor = comment.authorId === user.id;
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );

    if (!isAuthor && !access) {
      throw new ForbiddenException('Недостаточно прав для редактирования комментария');
    }

    return this.commentService.update(id, body.content, user.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    const comment = await this.commentService.findOne(id);
    if (!comment) {
      throw new ForbiddenException('Комментарий не найден');
    }

    const entity = await this.entityService.findOne(comment.entityId);
    if (!entity) {
      throw new ForbiddenException('Заявка не найдена');
    }

    // Автор может удалить свой комментарий, admin workspace - любой
    const isAuthor = comment.authorId === user.id;
    const access = await this.workspaceService.checkAccess(
      entity.workspaceId,
      user.id,
      user.role,
      WorkspaceRole.ADMIN,
    );

    if (!isAuthor && !access) {
      throw new ForbiddenException('Недостаточно прав для удаления комментария');
    }

    return this.commentService.remove(id, user.id);
  }
}
