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

  @Column({ name: 'sla_instance_id', type: 'uuid' })
  slaInstanceId: string;

  @ManyToOne(() => SlaInstance, (instance) => instance.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sla_instance_id' })
  slaInstance: SlaInstance;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: SlaEventType;

  @Column({ name: 'event_data', type: 'jsonb', default: {} })
  eventData: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
