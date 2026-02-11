import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Section } from './section.entity';
import { SectionMember } from './section-member.entity';
import { Workspace } from '../workspace/workspace.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { Role } from '../rbac/role.entity';
import { SectionService } from './section.service';
import { SectionController } from './section.controller';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Section, SectionMember, Workspace, WorkspaceMember, Role]),
    WebsocketModule,
  ],
  providers: [SectionService],
  controllers: [SectionController],
  exports: [SectionService],
})
export class SectionModule {}
