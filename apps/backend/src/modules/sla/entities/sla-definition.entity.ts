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

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50 })
  appliesTo: SlaTargetType;

  @Column({ type: 'jsonb', default: {} })
  conditions: SlaConditions;

  @Column({ type: 'int', nullable: true })
  responseTime: number | null; // minutes

  @Column({ type: 'int', nullable: true })
  resolutionTime: number | null; // minutes

  @Column({ type: 'int', default: 80 })
  warningThreshold: number; // percentage

  @Column({ type: 'boolean', default: true })
  businessHoursOnly: boolean;

  @Column({
    type: 'jsonb',
    default: {
      start: '09:00',
      end: '18:00',
      timezone: 'Europe/Moscow',
      workdays: [1, 2, 3, 4, 5],
    },
  })
  businessHours: BusinessHours;

  @Column({ type: 'jsonb', default: [] })
  escalationRules: EscalationRule[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number; // Higher = more important

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SlaInstance, (instance) => instance.slaDefinition)
  instances: SlaInstance[];
}
