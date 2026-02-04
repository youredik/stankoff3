import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceEntity } from './entity.entity';
import { Comment } from './comment.entity';
import { GlobalCounter } from './global-counter.entity';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { EntityService } from './entity.service';
import { EntityController } from './entity.controller';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { RecommendationsService } from './recommendations/recommendations.service';
import { RecommendationsController } from './recommendations/recommendations.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { S3Module } from '../s3/s3.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AutomationModule } from '../automation/automation.module';
import { BpmnModule } from '../bpmn/bpmn.module';
import { SlaModule } from '../sla/sla.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity, Comment, GlobalCounter, Workspace, User]),
    WebsocketModule,
    S3Module,
    WorkspaceModule,
    forwardRef(() => AuditLogModule),
    forwardRef(() => AutomationModule),
    forwardRef(() => BpmnModule),
    SlaModule,
  ],
  providers: [EntityService, CommentService, RecommendationsService],
  controllers: [EntityController, CommentController, RecommendationsController],
  exports: [EntityService, RecommendationsService],
})
export class EntityModule {}
