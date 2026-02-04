import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRule } from './automation-rule.entity';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { WorkspaceEntity } from '../entity/entity.entity';
import { User } from '../user/user.entity';
import { WorkspaceModule } from '../workspace/workspace.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { EmailModule } from '../email/email.module';
import { DmnModule } from '../dmn/dmn.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationRule, WorkspaceEntity, User]),
    forwardRef(() => WorkspaceModule),
    forwardRef(() => WebsocketModule),
    EmailModule,
    DmnModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
