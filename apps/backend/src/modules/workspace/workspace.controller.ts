import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { Workspace } from './workspace.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/user.entity';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  async findAll(): Promise<Workspace[]> {
    return this.workspaceService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Workspace | null> {
    return this.workspaceService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() workspaceData: Partial<Workspace>): Promise<Workspace> {
    return this.workspaceService.create(workspaceData);
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
}
