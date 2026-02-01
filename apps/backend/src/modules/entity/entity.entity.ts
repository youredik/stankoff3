import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { Comment } from './comment.entity';

@Entity('entities')
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customId: string; // TP-1234, REK-445 и т.д.

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
}
