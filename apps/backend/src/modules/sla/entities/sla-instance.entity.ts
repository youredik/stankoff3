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
import { SlaDefinition, SlaTargetType } from './sla-definition.entity';
import { SlaEvent } from './sla-event.entity';

export type SlaStatus = 'pending' | 'met' | 'breached';

@Entity('sla_instances')
export class SlaInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sla_definition_id', type: 'uuid' })
  slaDefinitionId: string;

  @ManyToOne(() => SlaDefinition, (def) => def.instances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sla_definition_id' })
  slaDefinition: SlaDefinition;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'target_type', type: 'varchar', length: 50 })
  targetType: SlaTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ name: 'response_due_at', type: 'timestamptz', nullable: true })
  responseDueAt: Date | null;

  @Column({ name: 'resolution_due_at', type: 'timestamptz', nullable: true })
  resolutionDueAt: Date | null;

  @Column({ name: 'first_response_at', type: 'timestamptz', nullable: true })
  firstResponseAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'response_status', type: 'varchar', length: 50, default: 'pending' })
  responseStatus: SlaStatus;

  @Column({ name: 'resolution_status', type: 'varchar', length: 50, default: 'pending' })
  resolutionStatus: SlaStatus;

  @Column({ name: 'is_paused', type: 'boolean', default: false })
  isPaused: boolean;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ name: 'total_paused_minutes', type: 'int', default: 0 })
  totalPausedMinutes: number;

  @Column({ name: 'current_escalation_level', type: 'int', default: 0 })
  currentEscalationLevel: number;

  @Column({ name: 'last_escalation_at', type: 'timestamptz', nullable: true })
  lastEscalationAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SlaEvent, (event) => event.slaInstance)
  events: SlaEvent[];
}
