import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../../workspace/workspace.entity';
import { User } from '../../user/user.entity';
import { ProcessDefinition } from './process-definition.entity';

export enum TriggerType {
  ENTITY_CREATED = 'entity_created',
  STATUS_CHANGED = 'status_changed',
  ASSIGNEE_CHANGED = 'assignee_changed',
  COMMENT_ADDED = 'comment_added',
  CRON = 'cron',
  WEBHOOK = 'webhook',
  MESSAGE = 'message',
}

export interface TriggerConditions {
  // For entity_created
  entityTypes?: string[];

  // For status_changed
  fromStatus?: string;
  toStatus?: string;

  // For assignee_changed
  onlyWhenAssigned?: boolean;

  // For cron
  expression?: string;
  timezone?: string;

  // For webhook
  secret?: string;
  allowedIps?: string[];

  // Generic filters
  priority?: string;
  category?: string;

  // Custom filter expression
  customExpression?: string;
}

export interface VariableMappings {
  [variableName: string]: string; // JSONPath expression like $.entity.id
}

@Entity('process_triggers')
export class ProcessTrigger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  processDefinitionId: string;

  @ManyToOne(() => ProcessDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processDefinitionId' })
  processDefinition: ProcessDefinition;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({
    type: 'enum',
    enum: TriggerType,
  })
  triggerType: TriggerType;

  @Column({ type: 'jsonb', default: {} })
  conditions: TriggerConditions;

  @Column({ type: 'jsonb', default: {} })
  variableMappings: VariableMappings;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastTriggeredAt: Date | null;

  @Column({ type: 'int', default: 0 })
  triggerCount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => TriggerExecution, (execution) => execution.trigger)
  executions: TriggerExecution[];
}

export enum TriggerExecutionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

@Entity('trigger_executions')
export class TriggerExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  triggerId: string;

  @ManyToOne(() => ProcessTrigger, (trigger) => trigger.executions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'triggerId' })
  trigger: ProcessTrigger;

  @Column({ type: 'uuid', nullable: true })
  processInstanceId: string | null;

  @Column({ type: 'jsonb' })
  triggerContext: Record<string, any>;

  @Column({
    type: 'enum',
    enum: TriggerExecutionStatus,
  })
  status: TriggerExecutionStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  executedAt: Date;
}
