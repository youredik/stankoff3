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
import { Workspace } from '../../workspace/workspace.entity';

export type AiProvider = 'openai' | 'anthropic' | 'yandex' | 'gigachat' | 'ollama' | 'unknown';
export type AiOperation = 'classify' | 'generate' | 'embed' | 'search' | 'chat' | 'summarize';

@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  provider: AiProvider;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  operation: AiOperation;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  @Index()
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string;

  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'int', default: 0 })
  outputTokens: number;

  @Column({ name: 'latency_ms', type: 'int', default: 0 })
  latencyMs: number;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
