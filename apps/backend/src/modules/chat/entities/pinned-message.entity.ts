import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { Message } from './message.entity';
import { Conversation } from './conversation.entity';

@Entity('pinned_messages')
@Unique('uq_pinned_message', ['conversationId', 'messageId'])
@Index('idx_pinned_messages_conversation', ['conversationId'])
export class PinnedMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  messageId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column()
  pinnedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pinnedById' })
  pinnedBy: User;

  @CreateDateColumn()
  pinnedAt: Date;
}
