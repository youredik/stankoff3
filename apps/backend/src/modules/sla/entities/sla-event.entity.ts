import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SlaInstance } from './sla-instance.entity';

export type SlaEventType =
  | 'created'
  | 'response_recorded'
  | 'resolved'
  | 'breached'
  | 'warning_sent'
  | 'escalated'
  | 'paused'
  | 'resumed';

@Entity('sla_events')
export class SlaEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  slaInstanceId: string;

  @ManyToOne(() => SlaInstance, (instance) => instance.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slaInstanceId' })
  slaInstance: SlaInstance;

  @Column({ type: 'varchar', length: 50 })
  eventType: SlaEventType;

  @Column({ type: 'jsonb', default: {} })
  eventData: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
