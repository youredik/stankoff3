import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../user/user.entity';
import { WorkspaceEntity } from '../../entity/entity.entity';

export enum EntityLinkType {
  SPAWNED = 'spawned',
  BLOCKS = 'blocks',
  BLOCKED_BY = 'blocked_by',
  RELATED = 'related',
  DUPLICATE = 'duplicate',
  PARENT = 'parent',
  CHILD = 'child',
}

export interface EntityLinkMetadata {
  createdByProcess?: string;
  reason?: string;
  [key: string]: any;
}

@Entity('entity_links')
@Unique(['sourceEntityId', 'targetEntityId', 'linkType'])
export class EntityLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sourceEntityId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceEntityId' })
  sourceEntity: WorkspaceEntity;

  @Column({ type: 'uuid' })
  targetEntityId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetEntityId' })
  targetEntity: WorkspaceEntity;

  @Column({
    type: 'enum',
    enum: EntityLinkType,
  })
  linkType: EntityLinkType;

  @Column({ type: 'jsonb', default: {} })
  metadata: EntityLinkMetadata;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  processInstanceId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
