import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessAuditActions1771100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE audit_logs_action_enum ADD VALUE IF NOT EXISTS 'process:started'
    `);
    await queryRunner.query(`
      ALTER TYPE audit_logs_action_enum ADD VALUE IF NOT EXISTS 'process:completed'
    `);
    await queryRunner.query(`
      ALTER TYPE audit_logs_action_enum ADD VALUE IF NOT EXISTS 'process:cancelled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values
  }
}
