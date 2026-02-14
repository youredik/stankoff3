import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceEntity } from './entity.entity';
import { Comment } from './comment.entity';
import { GlobalCounter } from './global-counter.entity';
import { ProductCategory } from './product-category.entity';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { EntityService } from './entity.service';
import { EntityController } from './entity.controller';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { ProductCategoryService } from './product-category.service';
import { ProductCategoryController } from './product-category.controller';
import { RecommendationsService } from './recommendations/recommendations.service';
import { RecommendationsController } from './recommendations/recommendations.controller';
import { OgPreviewService } from './og-preview.service';
import { OgPreviewController } from './og-preview.controller';
import { FieldValidationService } from './field-validation.service';
import { FormulaEvaluatorService } from './formula-evaluator.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { S3Module } from '../s3/s3.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AutomationModule } from '../automation/automation.module';
import { BpmnModule } from '../bpmn/bpmn.module';
import { SlaModule } from '../sla/sla.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity, Comment, GlobalCounter, ProductCategory, Workspace, User]),
    WebsocketModule,
    S3Module,
    WorkspaceModule,
    forwardRef(() => AuditLogModule),
    forwardRef(() => AutomationModule),
    forwardRef(() => BpmnModule),
    forwardRef(() => AiModule),
    SlaModule,
  ],
  providers: [EntityService, CommentService, ProductCategoryService, RecommendationsService, OgPreviewService, FieldValidationService, FormulaEvaluatorService],
  controllers: [EntityController, CommentController, ProductCategoryController, RecommendationsController, OgPreviewController],
  exports: [EntityService, ProductCategoryService, RecommendationsService],
})
export class EntityModule {}
