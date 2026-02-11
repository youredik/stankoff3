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
import { Conversation } from './conversation.entity';

export type ParticipantRole = 'owner' | 'admin' | 'member';

@Entity('conversation_participants')
@Unique('uq_conversation_participant', ['conversationId', 'userId'])
@Index('idx_conv_participants_user', ['userId'])
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @ManyToOne(() => Conversation, (c) => c.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role: ParticipantRole;

  @Column({ type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  lastReadMessageId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  mutedUntil: Date | null;

  @CreateDateColumn()
  joinedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt: Date | null;
}
