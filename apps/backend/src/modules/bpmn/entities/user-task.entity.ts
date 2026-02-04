import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../../workspace/workspace.entity';
import { User } from '../../user/user.entity';
import { ProcessInstance } from './process-instance.entity';

export enum UserTaskStatus {
  CREATED = 'created',
  CLAIMED = 'claimed',
  COMPLETED = 'completed',
  DELEGATED = 'delegated',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum UserTaskType {
  APPROVAL = 'approval',
  REVIEW = 'review',
  DATA_ENTRY = 'data-entry',
  CUSTOM = 'custom',
}

export interface TaskHistoryEntry {
  action: string;
  userId: string;
  timestamp: string;
  data?: Record<string, any>;
}

@Entity('user_tasks')
export class UserTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  processInstanceId: string;

  @ManyToOne(() => ProcessInstance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processInstanceId' })
  processInstance: ProcessInstance;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  // Zeebe job key - needed to complete the job
  @Column({ type: 'varchar', length: 255, unique: true })
  jobKey: string;

  // BPMN element ID
  @Column({ type: 'varchar', length: 255 })
  elementId: string;

  // BPMN element name
  @Column({ type: 'varchar', length: 255, nullable: true })
  elementName: string | null;

  // Task type
  @Column({ type: 'varchar', length: 100, default: 'custom' })
  taskType: string;

  // Form reference or inline schema
  @Column({ type: 'varchar', length: 255, nullable: true })
  formKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  formSchema: Record<string, any> | null;

  @Column({ type: 'jsonb', default: {} })
  formData: Record<string, any>;

  // Assignment
  @Column({ type: 'uuid', nullable: true })
  assigneeId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigneeId' })
  assignee: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  assigneeEmail: string | null;

  @Column({ type: 'text', array: true, nullable: true })
  candidateGroups: string[] | null;

  @Column({ type: 'uuid', array: true, nullable: true })
  candidateUsers: string[] | null;

  // Deadlines
  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  followUpDate: Date | null;

  @Column({ type: 'int', default: 50 })
  priority: number;

  // Status
  @Column({
    type: 'enum',
    enum: UserTaskStatus,
    default: UserTaskStatus.CREATED,
  })
  status: UserTaskStatus;

  // Claim info
  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  claimedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'claimedById' })
  claimedBy: User;

  // Completion info
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  completedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'completedById' })
  completedBy: User;

  @Column({ type: 'jsonb', nullable: true })
  completionResult: Record<string, any> | null;

  // History for audit
  @Column({ type: 'jsonb', default: [] })
  history: TaskHistoryEntry[];

  // Snapshot of process variables
  @Column({ type: 'jsonb', default: {} })
  processVariables: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => UserTaskComment, (comment) => comment.task)
  comments: UserTaskComment[];
}

@Entity('user_task_comments')
export class UserTaskComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @ManyToOne(() => UserTask, (task) => task.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: UserTask;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
