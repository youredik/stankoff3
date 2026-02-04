import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { Workspace } from '../../workspace/workspace.entity';
import { User } from '../../user/user.entity';
import { ProcessDefinition } from './process-definition.entity';

export enum ProcessInstanceStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  TERMINATED = 'terminated',
  INCIDENT = 'incident',
}

@Entity('process_instances')
@Index('idx_process_instances_entity', ['entityId'])
@Index('idx_process_instances_workspace', ['workspaceId'])
@Index('idx_process_instances_key', ['processInstanceKey'])
export class ProcessInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ nullable: true })
  entityId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'entityId' })
  entity: WorkspaceEntity;

  @Column()
  processDefinitionId: string;

  @ManyToOne(() => ProcessDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processDefinitionId' })
  processDefinition: ProcessDefinition;

  @Column()
  processDefinitionKey: string;

  @Column({ unique: true })
  processInstanceKey: string;

  @Column({ nullable: true })
  businessKey: string;

  @Column({
    type: 'enum',
    enum: ProcessInstanceStatus,
    default: ProcessInstanceStatus.ACTIVE,
  })
  status: ProcessInstanceStatus;

  @Column({ type: 'jsonb', default: {} })
  variables: Record<string, any>;

  @Column({ nullable: true })
  startedById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'startedById' })
  startedBy: User;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
