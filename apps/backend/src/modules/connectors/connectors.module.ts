import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConnectorsService } from './connectors.service';
import { ConnectorsController } from './connectors.controller';
import { EmailConnector } from './implementations/email.connector';
import { TelegramConnector } from './implementations/telegram.connector';
import { RestConnector } from './implementations/rest.connector';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => EmailModule),
  ],
  controllers: [ConnectorsController],
  providers: [
    ConnectorsService,
    EmailConnector,
    TelegramConnector,
    RestConnector,
  ],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
