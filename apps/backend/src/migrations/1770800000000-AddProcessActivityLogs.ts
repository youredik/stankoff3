import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessActivityLogs1770800000000 implements MigrationInterface {
  name = 'AddProcessActivityLogs1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "process_activity_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "processInstanceId" uuid NOT NULL,
        "processDefinitionId" uuid NOT NULL,
        "elementId" varchar(255) NOT NULL,
        "elementType" varchar(100) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'success',
        "startedAt" timestamptz NOT NULL DEFAULT now(),
        "completedAt" timestamptz,
        "durationMs" int,
        "workerType" varchar(100),
        CONSTRAINT "PK_process_activity_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_activity_log_instance" FOREIGN KEY ("processInstanceId")
          REFERENCES "process_instances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_activity_log_definition" FOREIGN KEY ("processDefinitionId")
          REFERENCES "process_definitions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_log_definition"
        ON "process_activity_logs" ("processDefinitionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_log_instance"
        ON "process_activity_logs" ("processInstanceId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activity_log_element"
        ON "process_activity_logs" ("processDefinitionId", "elementId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "process_activity_logs"`);
  }
}
