import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceEntity } from './entity.entity';
import { Comment } from './comment.entity';
import { Workspace } from '../workspace/workspace.entity';
import { EntityService } from './entity.service';
import { EntityController } from './entity.controller';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { S3Module } from '../s3/s3.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity, Comment, Workspace]),
    WebsocketModule,
    S3Module,
    WorkspaceModule,
  ],
  providers: [EntityService, CommentService],
  controllers: [EntityController, CommentController],
  exports: [EntityService],
})
export class EntityModule {}
