import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBpmnExtendedTables1770400000000 implements MigrationInterface {
  name = 'AddBpmnExtendedTables1770400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==================== PROCESS TRIGGERS ====================

    // Create trigger type enum
    await queryRunner.query(`
      CREATE TYPE "trigger_type_enum" AS ENUM (
        'entity_created',
        'status_changed',
        'assignee_changed',
        'comment_added',
        'cron',
        'webhook',
        'message'
      )
    `);

    // Create process_triggers table
    await queryRunner.query(`
      CREATE TABLE "process_triggers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "processDefinitionId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "triggerType" "trigger_type_enum" NOT NULL,
        "conditions" jsonb NOT NULL DEFAULT '{}',
        "variableMappings" jsonb NOT NULL DEFAULT '{}',
        "isActive" boolean NOT NULL DEFAULT true,
        "lastTriggeredAt" TIMESTAMP WITH TIME ZONE,
        "triggerCount" integer NOT NULL DEFAULT 0,
        "name" varchar(255),
        "description" text,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_process_triggers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_process_triggers_definition" FOREIGN KEY ("processDefinitionId")
          REFERENCES "process_definitions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_process_triggers_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_process_triggers_user" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create trigger_executions table
    await queryRunner.query(`
      CREATE TYPE "trigger_execution_status_enum" AS ENUM ('success', 'failed', 'skipped')
    `);

    await queryRunner.query(`
      CREATE TABLE "trigger_executions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "triggerId" uuid NOT NULL,
        "processInstanceId" uuid,
        "triggerContext" jsonb NOT NULL,
        "status" "trigger_execution_status_enum" NOT NULL,
        "errorMessage" text,
        "executedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trigger_executions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trigger_executions_trigger" FOREIGN KEY ("triggerId")
          REFERENCES "process_triggers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_trigger_executions_instance" FOREIGN KEY ("processInstanceId")
          REFERENCES "process_instances"("id") ON DELETE SET NULL
      )
    `);

    // Indexes for triggers
    await queryRunner.query(`
      CREATE INDEX "idx_process_triggers_workspace" ON "process_triggers" ("workspaceId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_process_triggers_type_active" ON "process_triggers" ("triggerType")
        WHERE "isActive" = true
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_process_triggers_definition" ON "process_triggers" ("processDefinitionId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_trigger_executions_trigger" ON "trigger_executions" ("triggerId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_trigger_executions_date" ON "trigger_executions" ("executedAt")
    `);

    // ==================== USER TASKS ====================

    // Create user_task_status enum
    await queryRunner.query(`
      CREATE TYPE "user_task_status_enum" AS ENUM ('created', 'claimed', 'completed', 'delegated', 'expired', 'cancelled')
    `);

    // Create user_tasks table
    await queryRunner.query(`
      CREATE TABLE "user_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "processInstanceId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "entityId" uuid,
        "jobKey" varchar(255) NOT NULL UNIQUE,
        "elementId" varchar(255) NOT NULL,
        "elementName" varchar(255),
        "taskType" varchar(100) NOT NULL DEFAULT 'custom',
        "formKey" varchar(255),
        "formSchema" jsonb,
        "formData" jsonb NOT NULL DEFAULT '{}',
        "assigneeId" uuid,
        "assigneeEmail" varchar(255),
        "candidateGroups" text[],
        "candidateUsers" uuid[],
        "dueDate" TIMESTAMP WITH TIME ZONE,
        "followUpDate" TIMESTAMP WITH TIME ZONE,
        "priority" integer NOT NULL DEFAULT 50,
        "status" "user_task_status_enum" NOT NULL DEFAULT 'created',
        "claimedAt" TIMESTAMP WITH TIME ZONE,
        "claimedById" uuid,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "completedById" uuid,
        "completionResult" jsonb,
        "history" jsonb NOT NULL DEFAULT '[]',
        "processVariables" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_tasks_instance" FOREIGN KEY ("processInstanceId")
          REFERENCES "process_instances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_tasks_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_tasks_entity" FOREIGN KEY ("entityId")
          REFERENCES "entities"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_user_tasks_assignee" FOREIGN KEY ("assigneeId")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_user_tasks_claimed_by" FOREIGN KEY ("claimedById")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_user_tasks_completed_by" FOREIGN KEY ("completedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create user_task_comments table
    await queryRunner.query(`
      CREATE TABLE "user_task_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "taskId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "content" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_task_comments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_task_comments_task" FOREIGN KEY ("taskId")
          REFERENCES "user_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_task_comments_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Indexes for user_tasks
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_assignee" ON "user_tasks" ("assigneeId")
        WHERE "status" IN ('created', 'claimed')
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_workspace" ON "user_tasks" ("workspaceId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_status" ON "user_tasks" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_due_date" ON "user_tasks" ("dueDate")
        WHERE "status" IN ('created', 'claimed')
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_candidate_groups" ON "user_tasks" USING GIN ("candidateGroups")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_candidate_users" ON "user_tasks" USING GIN ("candidateUsers")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_tasks_job_key" ON "user_tasks" ("jobKey")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_task_comments_task" ON "user_task_comments" ("taskId")
    `);

    // ==================== ENTITY LINKS (Cross-workspace) ====================

    // Create entity_link_type enum
    await queryRunner.query(`
      CREATE TYPE "entity_link_type_enum" AS ENUM (
        'spawned',
        'blocks',
        'blocked_by',
        'related',
        'duplicate',
        'parent',
        'child'
      )
    `);

    // Create entity_links table
    await queryRunner.query(`
      CREATE TABLE "entity_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sourceEntityId" uuid NOT NULL,
        "targetEntityId" uuid NOT NULL,
        "linkType" "entity_link_type_enum" NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_entity_links" PRIMARY KEY ("id"),
        CONSTRAINT "FK_entity_links_source" FOREIGN KEY ("sourceEntityId")
          REFERENCES "entities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_entity_links_target" FOREIGN KEY ("targetEntityId")
          REFERENCES "entities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_entity_links_user" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_entity_links_unique" UNIQUE ("sourceEntityId", "targetEntityId", "linkType")
      )
    `);

    // Indexes for entity_links
    await queryRunner.query(`
      CREATE INDEX "idx_entity_links_source" ON "entity_links" ("sourceEntityId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_entity_links_target" ON "entity_links" ("targetEntityId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_entity_links_type" ON "entity_links" ("linkType")
    `);

    // ==================== USER GROUPS (for candidate groups in tasks) ====================

    // Create user_groups table
    await queryRunner.query(`
      CREATE TABLE "user_groups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "key" varchar(100) NOT NULL,
        "description" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_groups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_groups_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_user_groups_workspace_key" UNIQUE ("workspaceId", "key")
      )
    `);

    // Create user_group_members table
    await queryRunner.query(`
      CREATE TABLE "user_group_members" (
        "groupId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "addedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_group_members" PRIMARY KEY ("groupId", "userId"),
        CONSTRAINT "FK_user_group_members_group" FOREIGN KEY ("groupId")
          REFERENCES "user_groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_group_members_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Indexes for user_groups
    await queryRunner.query(`
      CREATE INDEX "idx_user_groups_workspace" ON "user_groups" ("workspaceId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_group_members_user" ON "user_group_members" ("userId")
    `);

    // ==================== FORM DEFINITIONS ====================

    // Create form_definitions table for reusable forms
    await queryRunner.query(`
      CREATE TABLE "form_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspaceId" uuid,
        "key" varchar(255) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "schema" jsonb NOT NULL,
        "uiSchema" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_form_definitions_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_form_definitions_user" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_form_definitions_workspace_key" UNIQUE ("workspaceId", "key")
      )
    `);

    // Indexes for form_definitions
    await queryRunner.query(`
      CREATE INDEX "idx_form_definitions_workspace" ON "form_definitions" ("workspaceId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_form_definitions_key" ON "form_definitions" ("key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop form_definitions
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_form_definitions_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_form_definitions_workspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "form_definitions"`);

    // Drop user_groups
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_group_members_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_groups_workspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_group_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_groups"`);

    // Drop entity_links
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entity_links_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entity_links_target"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entity_links_source"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_links"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "entity_link_type_enum"`);

    // Drop user_tasks
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_task_comments_task"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_job_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_candidate_users"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_candidate_groups"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_due_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_workspace"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_tasks_assignee"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_task_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_tasks"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_task_status_enum"`);

    // Drop triggers
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_trigger_executions_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_trigger_executions_trigger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_triggers_definition"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_triggers_type_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_triggers_workspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trigger_executions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trigger_execution_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "process_triggers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trigger_type_enum"`);
  }
}
