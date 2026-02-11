import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
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
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { AutomationModule } from './modules/automation/automation.module';
import { SearchModule } from './modules/search/search.module';
import { BpmnModule } from './modules/bpmn/bpmn.module';
import { SectionModule } from './modules/section/section.module';
import { SlaModule } from './modules/sla/sla.module';
import { DmnModule } from './modules/dmn/dmn.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { LegacyModule } from './modules/legacy/legacy.module';
import { AiModule } from './modules/ai/ai.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { ChatModule } from './modules/chat/chat.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { SeedModule } from './seed/seed.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionGuard } from './modules/rbac/rbac.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(typeOrmConfig),

    RbacModule,
    SeedModule,
    WorkspaceModule,
    EntityModule,
    UserModule,
    AuthModule,
    WebsocketModule,
    S3Module,
    AuditLogModule,
    EmailModule,
    AnalyticsModule,
    HealthModule,
    AutomationModule,
    SearchModule,
    BpmnModule,
    SectionModule,
    SlaModule,
    DmnModule,
    ConnectorsModule,
    LegacyModule,
    AiModule,
    OnboardingModule,
    GeocodingModule,
    ChatModule,
    KnowledgeBaseModule,
  ],
  providers: [
    // Глобальные guards - порядок важен: сначала JWT, потом Permission
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
