import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BpmnService } from './bpmn.service';
import { BpmnWorkersService } from './bpmn-workers.service';
import { BpmnTemplatesService } from './bpmn-templates.service';
import { BpmnController } from './bpmn.controller';
import { ProcessDefinition } from './entities/process-definition.entity';
import { ProcessInstance } from './entities/process-instance.entity';
import { ProcessTrigger, TriggerExecution } from './entities/process-trigger.entity';
import { UserTask, UserTaskComment } from './entities/user-task.entity';
import { EntityLink } from './entities/entity-link.entity';
import { UserGroup } from './entities/user-group.entity';
import { FormDefinition } from './entities/form-definition.entity';
import { TriggersService } from './triggers/triggers.service';
import { CronTriggerScheduler } from './triggers/cron-trigger.scheduler';
import { TriggersController, WebhookTriggersController } from './triggers/triggers.controller';
import { UserTasksService } from './user-tasks/user-tasks.service';
import { UserTasksController } from './user-tasks/user-tasks.controller';
import { UserTasksWorker } from './user-tasks/user-tasks.worker';
import { EntityLinksService } from './entity-links/entity-links.service';
import { EntityLinksController } from './entity-links/entity-links.controller';
import { CreateEntityWorker } from './entity-links/create-entity.worker';
import { ProcessMiningService } from './process-mining/process-mining.service';
import { ProcessMiningController } from './process-mining/process-mining.controller';
import { EntityModule } from '../entity/entity.module';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ConnectorsModule } from '../connectors/connectors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcessDefinition,
      ProcessInstance,
      ProcessTrigger,
      TriggerExecution,
      UserTask,
      UserTaskComment,
      EntityLink,
      UserGroup,
      FormDefinition,
    ]),
    // Import modules for workers (use forwardRef to avoid circular dependencies)
    forwardRef(() => EntityModule),
    forwardRef(() => EmailModule),
    forwardRef(() => AuditLogModule),
    forwardRef(() => WebsocketModule),
    forwardRef(() => ConnectorsModule),
  ],
  controllers: [
    BpmnController,
    TriggersController,
    WebhookTriggersController,
    UserTasksController,
    EntityLinksController,
    ProcessMiningController,
  ],
  providers: [
    BpmnService,
    BpmnWorkersService,
    BpmnTemplatesService,
    TriggersService,
    CronTriggerScheduler,
    UserTasksService,
    UserTasksWorker,
    EntityLinksService,
    CreateEntityWorker,
    ProcessMiningService,
  ],
  exports: [
    BpmnService,
    BpmnWorkersService,
    BpmnTemplatesService,
    TriggersService,
    CronTriggerScheduler,
    UserTasksService,
    UserTasksWorker,
    EntityLinksService,
    CreateEntityWorker,
    ProcessMiningService,
  ],
})
export class BpmnModule {}
