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

export type ClassificationCategory =
  | 'technical_support'
  | 'reclamation'
  | 'consultation'
  | 'spare_parts'
  | 'installation'
  | 'other';

export type ClassificationPriority = 'critical' | 'high' | 'medium' | 'low';

@Entity('ai_classifications')
export class AiClassification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entity_id', type: 'uuid', unique: true })
  @Index()
  entityId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index()
  category: ClassificationCategory;

  @Column({ type: 'varchar', length: 50, nullable: true })
  priority: ClassificationPriority;

  @Column({ type: 'jsonb', default: [] })
  skills: string[];

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  confidence: number;

  @Column({ type: 'text', nullable: true })
  reasoning: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string;

  @Column({ type: 'boolean', default: false })
  applied: boolean;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt: Date;

  @Column({ name: 'applied_by', type: 'uuid', nullable: true })
  appliedById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applied_by' })
  appliedBy: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
