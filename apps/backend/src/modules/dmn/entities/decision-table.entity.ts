import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { Workspace } from '../../workspace/workspace.entity';
import { DecisionEvaluation } from './decision-evaluation.entity';

export type HitPolicy = 'UNIQUE' | 'FIRST' | 'ANY' | 'COLLECT' | 'RULE_ORDER';

export interface InputColumn {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  expression?: string; // FEEL expression for complex inputs
}

export interface OutputColumn {
  id: string;
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  defaultValue?: unknown;
}

export interface DecisionRule {
  id: string;
  description?: string;
  inputs: Record<string, RuleCondition>;
  outputs: Record<string, unknown>;
  priority?: number;
}

export interface RuleCondition {
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'between' | 'any';
  value: unknown;
  value2?: unknown; // For 'between' operator
}

@Entity('decision_tables')
@Index(['workspaceId'])
export class DecisionTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'hit_policy', default: 'FIRST' })
  hitPolicy: HitPolicy;

  @Column({ name: 'input_columns', type: 'jsonb', default: [] })
  inputColumns: InputColumn[];

  @Column({ name: 'output_columns', type: 'jsonb', default: [] })
  outputColumns: OutputColumn[];

  @Column({ type: 'jsonb', default: [] })
  rules: DecisionRule[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ default: 1 })
  version: number;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => DecisionEvaluation, (evaluation) => evaluation.decisionTable)
  evaluations: DecisionEvaluation[];
}
