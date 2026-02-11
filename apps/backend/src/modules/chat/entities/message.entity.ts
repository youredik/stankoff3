import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { Conversation } from './conversation.entity';

export type MessageType = 'text' | 'voice' | 'system';

export interface MessageAttachment {
  id: string;
  name: string;
  size: number;
  key: string;
  mimeType: string;
  thumbnailKey?: string;
}

@Entity('messages')
@Index('idx_messages_conversation_created', ['conversationId', 'createdAt'])
@Index('idx_messages_author', ['authorId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 20, default: 'text' })
  type: MessageType;

  @Column({ type: 'uuid', nullable: true })
  replyToId: string | null;

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replyToId' })
  replyTo: Message | null;

  @Column('jsonb', { default: [] })
  attachments: MessageAttachment[];

  @Column({ type: 'varchar', nullable: true })
  voiceKey: string | null;

  @Column({ type: 'int', nullable: true })
  voiceDuration: number | null;

  @Column('jsonb', { nullable: true })
  voiceWaveform: number[] | null;

  @Column('jsonb', { default: [] })
  mentionedUserIds: string[];

  @Column({ default: false })
  isEdited: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'tsvector', select: false, nullable: true })
  searchVector: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
