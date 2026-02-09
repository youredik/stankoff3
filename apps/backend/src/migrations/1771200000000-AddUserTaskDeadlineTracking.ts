import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTaskDeadlineTracking1771200000000
  implements MigrationInterface
{
  name = 'AddUserTaskDeadlineTracking1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_tasks
      ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "overdueSentAt" TIMESTAMPTZ
    `);

    // Index for deadline scheduler queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_tasks_deadline
      ON user_tasks ("dueDate", "status")
      WHERE "dueDate" IS NOT NULL
        AND "status" IN ('created', 'claimed')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_user_tasks_deadline`,
    );
    await queryRunner.query(`
      ALTER TABLE user_tasks
      DROP COLUMN IF EXISTS "reminderSentAt",
      DROP COLUMN IF EXISTS "overdueSentAt"
    `);
  }
}
