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
import { User } from '../../user/user.entity';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { Workspace } from '../../workspace/workspace.entity';
import { ConversationParticipant } from './conversation-participant.entity';
import { Message } from './message.entity';

export type ConversationType = 'direct' | 'group' | 'entity' | 'ai_assistant';

@Entity('conversations')
@Index('idx_conversations_created_by', ['createdById'])
@Index('idx_conversations_last_message', ['lastMessageAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: ConversationType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'entityId' })
  entity: WorkspaceEntity | null;

  @Column({ type: 'uuid', nullable: true })
  workspaceId: string | null;

  @ManyToOne(() => Workspace, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace | null;

  @Column()
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastMessagePreview: string | null;

  @Column({ type: 'uuid', nullable: true })
  lastMessageAuthorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lastMessageAuthorId' })
  lastMessageAuthor: User | null;

  @OneToMany(() => ConversationParticipant, (p) => p.conversation)
  participants: ConversationParticipant[];

  @OneToMany(() => Message, (m) => m.conversation)
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
