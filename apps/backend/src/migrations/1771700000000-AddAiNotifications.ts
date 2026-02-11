import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiNotifications1771700000000 implements MigrationInterface {
  name = 'AddAiNotifications1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" varchar(50) NOT NULL,
        "title" varchar(500) NOT NULL,
        "message" text NOT NULL,
        "workspace_id" uuid,
        "entity_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "confidence" decimal(3,2) NOT NULL DEFAULT 0,
        "target_user_id" uuid,
        "read" boolean NOT NULL DEFAULT false,
        "dismissed" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_notifications_target_user" FOREIGN KEY ("target_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_notifications_type" ON "ai_notifications" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_notifications_workspace" ON "ai_notifications" ("workspace_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_notifications_target_user" ON "ai_notifications" ("target_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_notifications_created_at" ON "ai_notifications" ("created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_notifications_unread" ON "ai_notifications" ("read", "dismissed") WHERE "read" = false AND "dismissed" = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_notifications"`);
  }
}
