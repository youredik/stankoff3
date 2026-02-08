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
import { SeedService } from './seed.service';
import { SeedShowcase } from './seed-showcase';
import { User } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Comment } from './modules/entity/comment.entity';
import { Workspace } from './modules/workspace/workspace.entity';
import { WorkspaceMember } from './modules/workspace/workspace-member.entity';
import { Section } from './modules/section/section.entity';
import { SectionMember } from './modules/section/section-member.entity';
import { SlaDefinition } from './modules/sla/entities/sla-definition.entity';
import { SlaInstance } from './modules/sla/entities/sla-instance.entity';
import { SlaEvent } from './modules/sla/entities/sla-event.entity';
import { DecisionTable } from './modules/dmn/entities/decision-table.entity';
import { ProcessDefinition } from './modules/bpmn/entities/process-definition.entity';
import { ProcessInstance } from './modules/bpmn/entities/process-instance.entity';
import { ProcessTrigger } from './modules/bpmn/entities/process-trigger.entity';
import { AutomationRule } from './modules/automation/automation-rule.entity';
import { UserGroup } from './modules/bpmn/entities/user-group.entity';
import { EntityLink } from './modules/bpmn/entities/entity-link.entity';
import { ProcessActivityLog } from './modules/bpmn/entities/process-activity-log.entity';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(typeOrmConfig),
    TypeOrmModule.forFeature([
      User, WorkspaceEntity, Comment, Workspace, WorkspaceMember,
      Section, SectionMember,
      SlaDefinition, SlaInstance, SlaEvent,
      DecisionTable,
      ProcessDefinition, ProcessInstance, ProcessTrigger,
      AutomationRule, UserGroup,
      EntityLink, ProcessActivityLog,
    ]),

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
  ],
  providers: [
    SeedService,
    SeedShowcase,
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
