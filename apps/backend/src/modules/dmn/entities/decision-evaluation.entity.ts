import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DecisionTable } from './decision-table.entity';

export interface EvaluationResult {
  ruleId: string;
  outputs: Record<string, unknown>;
  matched: boolean;
}

@Entity('decision_evaluations')
@Index(['decisionTableId'])
@Index(['targetType', 'targetId'])
@Index(['createdAt'])
export class DecisionEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'decision_table_id' })
  decisionTableId: string;

  @ManyToOne(() => DecisionTable, (table) => table.evaluations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'decision_table_id' })
  decisionTable: DecisionTable;

  @Column({ name: 'target_type', nullable: true })
  targetType: string; // 'entity', 'task', 'process'

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string;

  @Column({ name: 'input_data', type: 'jsonb' })
  inputData: Record<string, unknown>;

  @Column({ name: 'output_data', type: 'jsonb' })
  outputData: Record<string, unknown>;

  @Column({ name: 'matched_rules', type: 'jsonb', default: [] })
  matchedRules: EvaluationResult[];

  @Column({ name: 'evaluation_time_ms', default: 0 })
  evaluationTimeMs: number;

  @Column({ name: 'triggered_by', nullable: true })
  triggeredBy: string; // 'manual', 'trigger', 'api', 'process'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
