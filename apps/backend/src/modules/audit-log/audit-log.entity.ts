import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { Workspace } from '../workspace/workspace.entity';

export enum AuditActionType {
  // Entity
  ENTITY_CREATED = 'entity:created',
  ENTITY_UPDATED = 'entity:updated',
  ENTITY_DELETED = 'entity:deleted',
  ENTITY_STATUS_CHANGED = 'entity:status:changed',
  ENTITY_ASSIGNEE_CHANGED = 'entity:assignee:changed',

  // Comments
  COMMENT_CREATED = 'comment:created',
  COMMENT_UPDATED = 'comment:updated',
  COMMENT_DELETED = 'comment:deleted',

  // Files
  FILE_UPLOADED = 'file:uploaded',
  FILE_DELETED = 'file:deleted',
}

export interface AuditLogDetails {
  description: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changedFields?: string[];
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  commentId?: string;
}

@Entity('audit_logs')
@Index(['workspaceId', 'createdAt'])
@Index(['entityId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditActionType,
  })
  @Index()
  action: AuditActionType;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorId' })
  actor: User | null;

  @Column({ nullable: true })
  @Index()
  actorId: string | null;

  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entityId' })
  entity: WorkspaceEntity | null;

  @Column({ nullable: true })
  entityId: string | null;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column()
  @Index()
  workspaceId: string;

  @Column('jsonb')
  details: AuditLogDetails;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
