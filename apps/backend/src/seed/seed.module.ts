import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { WorkspaceEntity } from '../modules/entity/entity.entity';
import { WorkspaceMember } from '../modules/workspace/workspace-member.entity';
import { Section } from '../modules/section/section.entity';
import { SectionMember } from '../modules/section/section-member.entity';
import { Comment } from '../modules/entity/comment.entity';
import { SlaDefinition } from '../modules/sla/entities/sla-definition.entity';
import { SlaInstance } from '../modules/sla/entities/sla-instance.entity';
import { SlaEvent } from '../modules/sla/entities/sla-event.entity';
import { DecisionTable } from '../modules/dmn/entities/decision-table.entity';
import { ProcessDefinition } from '../modules/bpmn/entities/process-definition.entity';
import { ProcessTrigger } from '../modules/bpmn/entities/process-trigger.entity';
import { EntityLink } from '../modules/bpmn/entities/entity-link.entity';
import { AutomationRule } from '../modules/automation/automation-rule.entity';
import { UserGroup } from '../modules/bpmn/entities/user-group.entity';
import { FormDefinition } from '../modules/bpmn/entities/form-definition.entity';
import { Role } from '../modules/rbac/role.entity';
import { KnowledgeArticle } from '../modules/knowledge-base/entities/knowledge-article.entity';
import { ProductCategory } from '../modules/entity/product-category.entity';

// Modules (forwardRef для избежания circular dependencies)
import { AuthModule } from '../modules/auth/auth.module';
import { BpmnModule } from '../modules/bpmn/bpmn.module';
import { LegacyModule } from '../modules/legacy/legacy.module';

// Seed services
import { SeedCleanupService } from './seed-cleanup.service';
import { SeedUsersService } from './seed-users.service';
import { SeedKeycloakService } from './seed-keycloak.service';
import { SeedRbacService } from './seed-rbac.service';
import { SeedStructureService } from './seed-structure.service';
import { SeedEntitiesService } from './seed-entities.service';
import { SeedItDepartmentService } from './seed-it-department.service';
import { SeedBpmnService } from './seed-bpmn.service';
import { SeedSlaDmnService } from './seed-sla-dmn.service';
import { SeedKnowledgeBaseService } from './seed-knowledge-base.service';
import { SeedUserGroupsService } from './seed-user-groups.service';
import { SeedSystemWorkspacesService } from './seed-system-workspaces.service';
import { SeedOrchestratorService } from './seed-orchestrator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Workspace,
      WorkspaceEntity,
      WorkspaceMember,
      Section,
      SectionMember,
      Comment,
      SlaDefinition,
      SlaInstance,
      SlaEvent,
      DecisionTable,
      ProcessDefinition,
      ProcessTrigger,
      EntityLink,
      AutomationRule,
      UserGroup,
      FormDefinition,
      Role,
      KnowledgeArticle,
      ProductCategory,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => BpmnModule),
    forwardRef(() => LegacyModule),
  ],
  providers: [
    SeedCleanupService,
    SeedUsersService,
    SeedRbacService,
    SeedKeycloakService,
    SeedStructureService,
    SeedEntitiesService,
    SeedItDepartmentService,
    SeedBpmnService,
    SeedSlaDmnService,
    SeedKnowledgeBaseService,
    SeedUserGroupsService,
    SeedSystemWorkspacesService,
    SeedOrchestratorService,
  ],
})
export class SeedModule {}
