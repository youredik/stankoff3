import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { AuditLogService, AuditLogFilters, PaginationOptions } from './audit-log.service';
import { AuditActionType } from './audit-log.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../user/user.entity';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceRole } from '../workspace/workspace-member.entity';

@Controller('audit-logs')
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get('entity/:entityId')
  async getEntityHistory(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: 'newest' | 'oldest',
    @CurrentUser() _user?: User,
  ) {
    // Проверяем доступ к сущности через workspace
    // (entity содержит workspaceId, и мы проверяем доступ к workspace)
    const options: PaginationOptions = {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      sort: sort || 'newest',
    };

    return this.auditLogService.getEntityHistory(entityId, options);
  }

  @Get('workspace/:workspaceId')
  async getWorkspaceHistory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('action') action?: AuditActionType,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: 'newest' | 'oldest',
    @CurrentUser() user?: User,
  ) {
    // Проверка доступа к workspace
    if (user && user.role !== UserRole.ADMIN) {
      const membership = await this.workspaceService.checkAccess(workspaceId, user.id, user.role);
      if (!membership) {
        throw new ForbiddenException('Нет доступа к этому рабочему месту');
      }
      // Viewer может смотреть историю, но только editor/admin видят фильтры
      if (membership.role === WorkspaceRole.VIEWER && (action || actorId)) {
        throw new ForbiddenException('Фильтры доступны только редакторам');
      }
    }

    const filters: AuditLogFilters = {
      action,
      entityId,
      actorId,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    };

    const options: PaginationOptions = {
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
      sort: sort || 'newest',
    };

    return this.auditLogService.getWorkspaceHistory(workspaceId, filters, options);
  }
}
