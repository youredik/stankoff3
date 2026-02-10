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

@Entity('message_reactions')
@Unique('uq_message_reaction', ['messageId', 'userId', 'emoji'])
@Index('idx_message_reactions_message', ['messageId'])
@Index('idx_message_reactions_user', ['userId'])
export class MessageReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  messageId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  emoji: string;

  @CreateDateColumn()
  createdAt: Date;
}
