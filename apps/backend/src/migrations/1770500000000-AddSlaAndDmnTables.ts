import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlaAndDmnTables1770500000000 implements MigrationInterface {
  name = 'AddSlaAndDmnTables1770500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===================== SLA Tables =====================

    // SLA Definitions
    await queryRunner.query(`
      CREATE TABLE sla_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

        name VARCHAR(255) NOT NULL,
        description TEXT,

        applies_to VARCHAR(50) NOT NULL,
        conditions JSONB DEFAULT '{}',

        response_time INT,
        resolution_time INT,
        warning_threshold INT DEFAULT 80,

        business_hours_only BOOLEAN DEFAULT true,
        business_hours JSONB DEFAULT '{"start": "09:00", "end": "18:00", "timezone": "Europe/Moscow", "workdays": [1,2,3,4,5]}',

        escalation_rules JSONB DEFAULT '[]',

        is_active BOOLEAN DEFAULT true,
        priority INT DEFAULT 0,

        created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_definitions_workspace ON sla_definitions(workspace_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_definitions_active ON sla_definitions(workspace_id, is_active)
      WHERE is_active = true
    `);

    // SLA Instances
    await queryRunner.query(`
      CREATE TABLE sla_instances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sla_definition_id UUID NOT NULL REFERENCES sla_definitions(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

        target_type VARCHAR(50) NOT NULL,
        target_id UUID NOT NULL,

        response_due_at TIMESTAMPTZ,
        resolution_due_at TIMESTAMPTZ,

        first_response_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,

        response_status VARCHAR(50) DEFAULT 'pending',
        resolution_status VARCHAR(50) DEFAULT 'pending',

        is_paused BOOLEAN DEFAULT false,
        paused_at TIMESTAMPTZ,
        total_paused_minutes INT DEFAULT 0,

        current_escalation_level INT DEFAULT 0,
        last_escalation_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_instances_target ON sla_instances(target_type, target_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_instances_due ON sla_instances(resolution_due_at)
      WHERE resolution_status = 'pending'
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_instances_workspace ON sla_instances(workspace_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_instances_pending ON sla_instances(workspace_id)
      WHERE resolution_status = 'pending' OR response_status = 'pending'
    `);

    // SLA Events
    await queryRunner.query(`
      CREATE TABLE sla_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sla_instance_id UUID NOT NULL REFERENCES sla_instances(id) ON DELETE CASCADE,

        event_type VARCHAR(50) NOT NULL,
        event_data JSONB DEFAULT '{}',

        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_events_instance ON sla_events(sla_instance_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sla_events_type ON sla_events(sla_instance_id, event_type)
    `);

    // ===================== DMN Tables =====================

    // Decision Tables
    await queryRunner.query(`
      CREATE TABLE decision_tables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

        key VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,

        dmn_xml TEXT,

        inputs JSONB NOT NULL DEFAULT '[]',
        outputs JSONB NOT NULL DEFAULT '[]',
        rules JSONB NOT NULL DEFAULT '[]',

        hit_policy VARCHAR(50) DEFAULT 'FIRST',

        version INT DEFAULT 1,
        is_active BOOLEAN DEFAULT true,

        deployed_key VARCHAR(255),
        deployed_at TIMESTAMPTZ,

        created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(workspace_id, key)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_decision_tables_workspace ON decision_tables(workspace_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_decision_tables_key ON decision_tables(key)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_decision_tables_active ON decision_tables(workspace_id, is_active)
      WHERE is_active = true
    `);

    // Decision Evaluations (audit log)
    await queryRunner.query(`
      CREATE TABLE decision_evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        decision_table_id UUID NOT NULL REFERENCES decision_tables(id) ON DELETE CASCADE,

        process_instance_id UUID REFERENCES process_instances(id) ON DELETE SET NULL,
        entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,

        input_values JSONB NOT NULL,
        output_values JSONB NOT NULL,
        matched_rules INT[],

        evaluated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_decision_evaluations_table ON decision_evaluations(decision_table_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_decision_evaluations_date ON decision_evaluations(evaluated_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_decision_evaluations_entity ON decision_evaluations(entity_id)
      WHERE entity_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop DMN tables
    await queryRunner.query(`DROP TABLE IF EXISTS decision_evaluations`);
    await queryRunner.query(`DROP TABLE IF EXISTS decision_tables`);

    // Drop SLA tables
    await queryRunner.query(`DROP TABLE IF EXISTS sla_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS sla_instances`);
    await queryRunner.query(`DROP TABLE IF EXISTS sla_definitions`);
  }
}
