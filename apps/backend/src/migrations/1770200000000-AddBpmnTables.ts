import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBpmnTables1770200000000 implements MigrationInterface {
  name = 'AddBpmnTables1770200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create process_definitions table
    await queryRunner.query(`
      CREATE TABLE "process_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "processId" varchar(255) NOT NULL,
        "bpmnXml" text NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "deployedKey" varchar(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deployedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_process_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_process_definitions_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_process_definitions_user" FOREIGN KEY ("createdById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create process_instances table
    await queryRunner.query(`
      CREATE TYPE "process_instance_status_enum" AS ENUM ('active', 'completed', 'terminated', 'incident')
    `);

    await queryRunner.query(`
      CREATE TABLE "process_instances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspaceId" uuid NOT NULL,
        "entityId" uuid,
        "processDefinitionId" uuid NOT NULL,
        "processDefinitionKey" varchar(255) NOT NULL,
        "processInstanceKey" varchar(255) NOT NULL UNIQUE,
        "businessKey" varchar(255),
        "status" "process_instance_status_enum" NOT NULL DEFAULT 'active',
        "variables" jsonb NOT NULL DEFAULT '{}',
        "startedById" uuid,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_process_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_process_instances_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_process_instances_entity" FOREIGN KEY ("entityId")
          REFERENCES "entities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_process_instances_user" FOREIGN KEY ("startedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "idx_process_definitions_workspace" ON "process_definitions" ("workspaceId")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_process_instances_workspace" ON "process_instances" ("workspaceId")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_process_instances_entity" ON "process_instances" ("entityId")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_process_instances_key" ON "process_instances" ("processInstanceKey")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_process_instances_status" ON "process_instances" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_instances_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_instances_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_instances_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_instances_workspace"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_definitions_workspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "process_instances"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "process_instance_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "process_definitions"`);
  }
}
