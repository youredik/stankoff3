import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';

// Триггеры - когда срабатывает правило
export enum TriggerType {
  ON_CREATE = 'on_create',           // При создании заявки
  ON_STATUS_CHANGE = 'on_status_change', // При изменении статуса
  ON_FIELD_CHANGE = 'on_field_change',   // При изменении поля
  ON_ASSIGN = 'on_assign',           // При назначении исполнителя
  ON_COMMENT = 'on_comment',         // При добавлении комментария
  SCHEDULED = 'scheduled',           // По расписанию (не реализовано)
}

// Типы действий
export enum ActionType {
  SET_STATUS = 'set_status',         // Установить статус
  SET_ASSIGNEE = 'set_assignee',     // Назначить исполнителя
  SET_PRIORITY = 'set_priority',     // Установить приоритет
  SET_FIELD = 'set_field',           // Установить значение поля
  SEND_NOTIFICATION = 'send_notification', // Отправить уведомление
  SEND_EMAIL = 'send_email',         // Отправить email
}

// Операторы сравнения для условий
export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
}

// Условие для срабатывания правила
export interface RuleCondition {
  field: string;              // Поле для проверки (status, priority, assigneeId, data.fieldId)
  operator: ConditionOperator;
  value?: any;                // Значение для сравнения (не нужно для is_empty/is_not_empty)
}

// Действие при срабатывании правила
export interface RuleAction {
  type: ActionType;
  config: {
    // Для SET_STATUS
    status?: string;
    // Для SET_ASSIGNEE
    assigneeId?: string | null;
    assigneeMode?: 'specific' | 'creator' | 'round_robin'; // round_robin = по очереди
    // Для SET_PRIORITY
    priority?: 'low' | 'medium' | 'high';
    // Для SET_FIELD
    fieldId?: string;
    fieldValue?: any;
    // Для SEND_NOTIFICATION / SEND_EMAIL
    recipientMode?: 'assignee' | 'creator' | 'specific' | 'all_workspace_members';
    recipientId?: string;
    message?: string;
    subject?: string; // Для email
  };
}

@Entity('automation_rules')
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'enum', enum: TriggerType })
  trigger: TriggerType;

  @Column({ type: 'jsonb', nullable: true })
  triggerConfig: {
    // Для ON_STATUS_CHANGE - какие статусы триггерят
    fromStatus?: string | string[];
    toStatus?: string | string[];
    // Для ON_FIELD_CHANGE - какое поле
    fieldId?: string;
  };

  @Column({ type: 'jsonb', default: [] })
  conditions: RuleCondition[];

  @Column({ type: 'jsonb' })
  actions: RuleAction[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  priority: number; // Порядок выполнения (меньше = раньше)

  @Column({ nullable: true })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Статистика
  @Column({ default: 0 })
  executionCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutedAt: Date;
}
