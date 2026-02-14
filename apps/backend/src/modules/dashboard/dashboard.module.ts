import { Module, forwardRef } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { BpmnModule } from '../bpmn/bpmn.module';
import { SlaModule } from '../sla/sla.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    forwardRef(() => BpmnModule),
    forwardRef(() => SlaModule),
    forwardRef(() => WorkspaceModule),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
