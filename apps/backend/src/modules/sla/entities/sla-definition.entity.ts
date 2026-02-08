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
import { SlaInstance } from './sla-instance.entity';

export type SlaTargetType = 'entity' | 'task' | 'process';

export interface SlaConditions {
  priority?: string;
  category?: string;
  status?: string;
  [key: string]: unknown;
}

export interface BusinessHours {
  start: string; // "09:00"
  end: string; // "18:00"
  timezone: string; // "Europe/Moscow"
  workdays: number[]; // [1,2,3,4,5] (Monday-Friday)
}

export interface EscalationRule {
  threshold: number; // Percentage (e.g., 80, 100, 150)
  action: 'notify' | 'escalate';
  targets: string[]; // ['assignee', 'manager', 'director', userId, groupName]
}

@Entity('sla_definitions')
export class SlaDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'applies_to', type: 'varchar', length: 50 })
  appliesTo: SlaTargetType;

  @Column({ type: 'jsonb', default: {} })
  conditions: SlaConditions;

  @Column({ name: 'response_time', type: 'int', nullable: true })
  responseTime: number | null; // minutes

  @Column({ name: 'resolution_time', type: 'int', nullable: true })
  resolutionTime: number | null; // minutes

  @Column({ name: 'warning_threshold', type: 'int', default: 80 })
  warningThreshold: number; // percentage

  @Column({ name: 'business_hours_only', type: 'boolean', default: true })
  businessHoursOnly: boolean;

  @Column({
    name: 'business_hours',
    type: 'jsonb',
    default: {
      start: '09:00',
      end: '18:00',
      timezone: 'Europe/Moscow',
      workdays: [1, 2, 3, 4, 5],
    },
  })
  businessHours: BusinessHours;

  @Column({ name: 'escalation_rules', type: 'jsonb', default: [] })
  escalationRules: EscalationRule[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number; // Higher = more important

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SlaInstance, (instance) => instance.slaDefinition)
  instances: SlaInstance[];
}
