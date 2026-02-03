import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema baseline migration.
 *
 * This migration serves as a baseline marker for the existing database schema.
 * The schema was created using TypeORM synchronize before migrations were introduced.
 *
 * Tables included in baseline:
 * - users
 * - workspaces
 * - workspace_members
 * - entities
 * - comments
 * - global_counters
 * - audit_logs
 * - automation_rules
 *
 * All future schema changes MUST be done via migrations.
 */
export class InitialSchema1738600000000 implements MigrationInterface {
  name = 'InitialSchema1738600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Baseline migration - schema already exists
    // This migration is a marker for the initial state
    console.log('Initial schema baseline - no changes needed');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot rollback initial schema
    console.log('Cannot rollback initial schema baseline');
  }
}
