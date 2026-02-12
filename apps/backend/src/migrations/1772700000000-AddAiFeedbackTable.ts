import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiFeedbackTable1772700000000 implements MigrationInterface {
  name = 'AddAiFeedbackTable1772700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" varchar(50) NOT NULL,
        "entity_id" uuid,
        "user_id" uuid NOT NULL,
        "rating" varchar(20) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_feedback" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_feedback_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_type" ON "ai_feedback" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_entity_id" ON "ai_feedback" ("entity_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_user_id" ON "ai_feedback" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ai_feedback_created_at" ON "ai_feedback" ("created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_feedback"`);
  }
}
