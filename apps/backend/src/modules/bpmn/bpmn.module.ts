import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BpmnService } from './bpmn.service';
import { BpmnWorkersService } from './bpmn-workers.service';
import { BpmnTemplatesService } from './bpmn-templates.service';
import { BpmnController } from './bpmn.controller';
import { ProcessDefinition } from './entities/process-definition.entity';
import { ProcessInstance } from './entities/process-instance.entity';
import { EntityModule } from '../entity/entity.module';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessDefinition, ProcessInstance]),
    // Import modules for workers (use forwardRef to avoid circular dependencies)
    forwardRef(() => EntityModule),
    forwardRef(() => EmailModule),
    forwardRef(() => AuditLogModule),
    forwardRef(() => WebsocketModule),
  ],
  controllers: [BpmnController],
  providers: [BpmnService, BpmnWorkersService, BpmnTemplatesService],
  exports: [BpmnService, BpmnWorkersService, BpmnTemplatesService],
})
export class BpmnModule {}
