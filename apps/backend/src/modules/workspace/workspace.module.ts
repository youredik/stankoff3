import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, WorkspaceMember, WorkspaceEntity])],
  providers: [WorkspaceService],
  controllers: [WorkspaceController],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
