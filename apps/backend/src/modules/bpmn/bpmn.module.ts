import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BpmnService } from './bpmn.service';
import { BpmnController } from './bpmn.controller';
import { ProcessDefinition } from './entities/process-definition.entity';
import { ProcessInstance } from './entities/process-instance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessDefinition, ProcessInstance])],
  controllers: [BpmnController],
  providers: [BpmnService],
  exports: [BpmnService],
})
export class BpmnModule {}
