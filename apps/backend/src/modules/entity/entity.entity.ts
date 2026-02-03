import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { Comment } from './comment.entity';

@Entity('entities')
@Index('idx_entities_workspace_status', ['workspaceId', 'status'])
@Index('idx_entities_workspace_created', ['workspaceId', 'createdAt'])
@Index('idx_entities_workspace_assignee', ['workspaceId', 'assigneeId'])
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index({ unique: true })
  customId: string; // TP-1234, REK-445 и т.д. - глобально уникальный

  @ManyToOne(() => Workspace, (workspace) => workspace.entities)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column()
  workspaceId: string;

  @Column()
  title: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  priority: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigneeId' })
  assignee: User;

  @Column({ nullable: true })
  @Index('idx_entities_assignee')
  assigneeId: string | null;

  @Column('jsonb', { default: {} })
  data: Record<string, any>;

  @Column('jsonb', { default: [] })
  linkedEntityIds: string[];

  @OneToMany(() => Comment, (comment) => comment.entity)
  comments: Comment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ============================================
  // Кэшированные поля для аналитики
  // ============================================

  // Количество комментариев (обновляется триггером)
  @Column({ default: 0 })
  commentCount: number;

  // Последняя активность (комментарий или изменение)
  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date;

  // Время первого ответа (для SLA метрик)
  @Column({ type: 'timestamp', nullable: true })
  firstResponseAt: Date;

  // Когда заявка была закрыта/решена
  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  // Full-text search vector (автоматически обновляется триггером)
  @Column({ type: 'tsvector', select: false, nullable: true })
  searchVector: string;
}
