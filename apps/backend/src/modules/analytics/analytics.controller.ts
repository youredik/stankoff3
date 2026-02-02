import { Controller, Get, Param, ForbiddenException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/user.entity';
import { WorkspaceService } from '../workspace/workspace.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Get('global')
  async getGlobalAnalytics(@CurrentUser() user: User) {
    // Get accessible workspaces
    const workspaces = await this.workspaceService.getAccessibleWorkspaces(
      user.id,
      user.role,
    );
    const workspaceIds = workspaces.map((w) => w.id);

    if (workspaceIds.length === 0) {
      return {
        totalWorkspaces: 0,
        totalEntities: 0,
        totalUsers: 0,
        entitiesByWorkspace: [],
        statusBreakdown: [],
        priorityBreakdown: [],
        recentActivity: [],
      };
    }

    return this.analyticsService.getGlobalAnalytics(workspaceIds);
  }

  @Get('workspace/:id')
  async getWorkspaceAnalytics(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    // Check access to workspace
    const access = await this.workspaceService.checkAccess(
      id,
      user.id,
      user.role,
    );
    if (!access) {
      throw new ForbiddenException('Нет доступа к этому рабочему месту');
    }

    return this.analyticsService.getWorkspaceAnalytics(id);
  }
}
