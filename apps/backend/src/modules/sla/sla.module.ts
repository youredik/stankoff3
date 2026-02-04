import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaDefinition } from './entities/sla-definition.entity';
import { SlaInstance } from './entities/sla-instance.entity';
import { SlaEvent } from './entities/sla-event.entity';
import { SlaService } from './sla.service';
import { SlaCalculatorService } from './sla-calculator.service';
import { SlaController } from './sla.controller';
import { WebsocketModule } from '../websocket/websocket.module';
import { WorkspaceEntity } from '../entity/entity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlaDefinition, SlaInstance, SlaEvent, WorkspaceEntity]),
    forwardRef(() => WebsocketModule),
  ],
  controllers: [SlaController],
  providers: [SlaService, SlaCalculatorService],
  exports: [SlaService, SlaCalculatorService],
})
export class SlaModule {}
