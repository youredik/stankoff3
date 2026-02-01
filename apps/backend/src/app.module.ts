import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { EntityModule } from './modules/entity/entity.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { S3Module } from './modules/s3/s3.module';
import { SeedService } from './seed.service';
import { User } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Workspace } from './modules/workspace/workspace.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([User, WorkspaceEntity, Workspace]),

    WorkspaceModule,
    EntityModule,
    UserModule,
    AuthModule,
    WebsocketModule,
    S3Module,
  ],
  providers: [SeedService],
})
export class AppModule {}
