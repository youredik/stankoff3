import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { typeOrmConfig } from './config/typeorm.config';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { EntityModule } from './modules/entity/entity.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { S3Module } from './modules/s3/s3.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { EmailModule } from './modules/email/email.module';
import { SeedService } from './seed.service';
import { User } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Workspace } from './modules/workspace/workspace.entity';
import { WorkspaceMember } from './modules/workspace/workspace-member.entity';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([User, WorkspaceEntity, Workspace, WorkspaceMember]),

    WorkspaceModule,
    EntityModule,
    UserModule,
    AuthModule,
    WebsocketModule,
    S3Module,
    AuditLogModule,
    EmailModule,
  ],
  providers: [
    SeedService,
    // Глобальные guards - порядок важен: сначала JWT, потом Roles
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
