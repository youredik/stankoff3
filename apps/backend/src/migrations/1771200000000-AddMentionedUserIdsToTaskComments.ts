import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMentionedUserIdsToTaskComments1771200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_task_comments"
      ADD COLUMN IF NOT EXISTS "mentionedUserIds" jsonb DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_task_comments"
      DROP COLUMN IF EXISTS "mentionedUserIds"
    `);
  }
}
