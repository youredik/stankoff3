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

  @Column({ type: 'uuid' })
  slaDefinitionId: string;

  @ManyToOne(() => SlaDefinition, (def) => def.instances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slaDefinitionId' })
  slaDefinition: SlaDefinition;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 50 })
  targetType: SlaTargetType;

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'timestamptz', nullable: true })
  responseDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolutionDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstResponseAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  responseStatus: SlaStatus;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  resolutionStatus: SlaStatus;

  @Column({ type: 'boolean', default: false })
  isPaused: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  totalPausedMinutes: number;

  @Column({ type: 'int', default: 0 })
  currentEscalationLevel: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastEscalationAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SlaEvent, (event) => event.slaInstance)
  events: SlaEvent[];
}
