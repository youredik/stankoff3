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
import { ProcessActivityLog } from './entities/process-activity-log.entity';
import { ProcessDefinitionVersion } from './entities/process-definition-version.entity';
import { TriggersService } from './triggers/triggers.service';
import { CronTriggerScheduler } from './triggers/cron-trigger.scheduler';
import { UserTaskDeadlineScheduler } from './user-tasks/user-task-deadline.scheduler';
import { TriggersController, WebhookTriggersController } from './triggers/triggers.controller';
import { UserTasksService } from './user-tasks/user-tasks.service';
import { UserTasksController } from './user-tasks/user-tasks.controller';
import { UserTasksWorker } from './user-tasks/user-tasks.worker';
import { EntityLinksService } from './entity-links/entity-links.service';
import { EntityLinksController } from './entity-links/entity-links.controller';
import { CreateEntityWorker } from './entity-links/create-entity.worker';
import { ProcessMiningService } from './process-mining/process-mining.service';
import { ProcessMiningController } from './process-mining/process-mining.controller';
import { FormDefinitionsService } from './forms/form-definitions.service';
import { FormDefinitionsController } from './forms/form-definitions.controller';
import { IncidentService } from './incidents/incident.service';
import { IncidentController } from './incidents/incident.controller';
import { EntityModule } from '../entity/entity.module';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { User } from '../user/user.entity';

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
      ProcessActivityLog,
      ProcessDefinitionVersion,
      User,
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
    FormDefinitionsController,
    IncidentController,
  ],
  providers: [
    BpmnService,
    BpmnWorkersService,
    BpmnTemplatesService,
    TriggersService,
    CronTriggerScheduler,
    UserTaskDeadlineScheduler,
    UserTasksService,
    UserTasksWorker,
    EntityLinksService,
    CreateEntityWorker,
    ProcessMiningService,
    FormDefinitionsService,
    IncidentService,
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
    FormDefinitionsService,
    IncidentService,
  ],
})
export class BpmnModule {}
