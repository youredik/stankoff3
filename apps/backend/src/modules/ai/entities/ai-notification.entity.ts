import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/user.entity';

export type AiNotificationType =
  | 'cluster_detected'       // Кластер похожих заявок
  | 'critical_entity'        // Критическая заявка (высокий приоритет)
  | 'sla_risk'               // SLA под угрозой, AI предлагает эскалацию
  | 'duplicate_suspected'    // Подозрение на дубликат
  | 'trend_anomaly';         // Аномалия в трендах (резкий рост заявок)

@Entity('ai_notifications')
export class AiNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  type: AiNotificationType;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  @Index()
  workspaceId: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  confidence: number;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  @Index()
  targetUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_user_id' })
  targetUser: User;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'boolean', default: false })
  dismissed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
