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
import { WorkspaceEntity } from './entity.entity';
import { User } from '../user/user.entity';

@Entity('comments')
@Index('idx_comments_entity_created', ['entityId', 'createdAt'])
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
  @Index('idx_comments_author')
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
    key: string;
    mimeType: string;
    thumbnailKey?: string;
  }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Full-text search vector (автоматически обновляется триггером)
  @Column({ type: 'tsvector', select: false, nullable: true })
  searchVector: string;
}
