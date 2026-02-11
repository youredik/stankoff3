import { Module, Global, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { User } from '../user/user.entity';
import { Workspace } from '../workspace/workspace.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { SectionMember } from '../section/section-member.entity';
import { RbacService } from './rbac.service';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { PermissionGuard } from './rbac.guard';
import { WebsocketModule } from '../websocket/websocket.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role,
      User,
      Workspace,
      WorkspaceMember,
      SectionMember,
    ]),
    forwardRef(() => WebsocketModule),
  ],
  providers: [RbacService, RoleService, PermissionGuard],
  controllers: [RoleController],
  exports: [RbacService, RoleService, PermissionGuard],
})
export class RbacModule {}
