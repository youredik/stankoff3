import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TriggersService } from './triggers.service';
import { TriggersController, WebhookTriggersController } from './triggers.controller';
import { ProcessTrigger, TriggerExecution } from '../entities/process-trigger.entity';
import { BpmnModule } from '../bpmn.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessTrigger, TriggerExecution]),
    forwardRef(() => BpmnModule),
  ],
  controllers: [TriggersController, WebhookTriggersController],
  providers: [TriggersService],
  exports: [TriggersService],
})
export class TriggersModule {}
