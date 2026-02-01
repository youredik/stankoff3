import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkspaceEntity } from './entity.entity';
import { User } from '../user/user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WorkspaceEntity, (entity) => entity.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'entityId' })
  entity: WorkspaceEntity;

  @Column()
  entityId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: string;

  @Column('text')
  content: string;

  @Column('jsonb', { default: [] })
  mentionedUserIds: string[];

  @Column('jsonb', { default: [] })
  attachments: {
    id: string;
    name: string;
    size: number;
    url: string;
    mimeType: string;
  }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
