import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSlaAndDmnTables1770600000000 implements MigrationInterface {
  name = 'FixSlaAndDmnTables1770600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================== Fix decision_tables =====================

    // Rename columns to match entity
    await queryRunner.query(`
      ALTER TABLE decision_tables
        RENAME COLUMN inputs TO input_columns
    `);

    await queryRunner.query(`
      ALTER TABLE decision_tables
        RENAME COLUMN outputs TO output_columns
    `);

    // Drop unused columns
    await queryRunner.query(`
      ALTER TABLE decision_tables
        DROP COLUMN IF EXISTS key,
        DROP COLUMN IF EXISTS dmn_xml,
        DROP COLUMN IF EXISTS deployed_key,
        DROP COLUMN IF EXISTS deployed_at
    `);

    // Drop unique constraint that was on (workspace_id, key)
    await queryRunner.query(`
      ALTER TABLE decision_tables
        DROP CONSTRAINT IF EXISTS decision_tables_workspace_id_key_key
    `);

    // ===================== Fix decision_evaluations =====================

    // Add missing columns
    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        ADD COLUMN IF NOT EXISTS target_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS target_id UUID,
        ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(50),
        ADD COLUMN IF NOT EXISTS evaluation_time_ms INT DEFAULT 0
    `);

    // Rename columns
    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        RENAME COLUMN input_values TO input_data
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        RENAME COLUMN output_values TO output_data
    `);

    // Change matched_rules from INT[] to JSONB
    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        DROP COLUMN IF EXISTS matched_rules
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        ADD COLUMN matched_rules JSONB DEFAULT '[]'
    `);

    // Rename evaluated_at to created_at
    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        RENAME COLUMN evaluated_at TO created_at
    `);

    // Add indexes for new columns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_decision_evaluations_target
        ON decision_evaluations(target_type, target_id)
        WHERE target_type IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert decision_evaluations
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_decision_evaluations_target
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        RENAME COLUMN created_at TO evaluated_at
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        DROP COLUMN IF EXISTS matched_rules
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        ADD COLUMN matched_rules INT[]
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        RENAME COLUMN output_data TO output_values
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        RENAME COLUMN input_data TO input_values
    `);

    await queryRunner.query(`
      ALTER TABLE decision_evaluations
        DROP COLUMN IF EXISTS evaluation_time_ms,
        DROP COLUMN IF EXISTS triggered_by,
        DROP COLUMN IF EXISTS target_id,
        DROP COLUMN IF EXISTS target_type
    `);

    // Revert decision_tables
    await queryRunner.query(`
      ALTER TABLE decision_tables
        ADD COLUMN key VARCHAR(255),
        ADD COLUMN dmn_xml TEXT,
        ADD COLUMN deployed_key VARCHAR(255),
        ADD COLUMN deployed_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TABLE decision_tables
        RENAME COLUMN output_columns TO outputs
    `);

    await queryRunner.query(`
      ALTER TABLE decision_tables
        RENAME COLUMN input_columns TO inputs
    `);
  }
}
