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
import { Workspace } from '../../workspace/workspace.entity';
import { User } from '../../user/user.entity';

export type ArticleType = 'document' | 'faq';
export type ArticleStatus = 'draft' | 'published';

@Entity('knowledge_articles')
export class KnowledgeArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  type: ArticleType;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  @Index()
  workspaceId: string | null;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index()
  category: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ name: 'file_key', type: 'varchar', length: 500, nullable: true })
  fileKey: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number | null;

  @Column({ name: 'file_mime_type', type: 'varchar', length: 100, nullable: true })
  fileMimeType: string | null;

  @Column({ type: 'varchar', length: 20, default: 'published' })
  @Index()
  status: ArticleStatus;

  @Column({ name: 'author_id', type: 'uuid', nullable: true })
  @Index()
  authorId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
