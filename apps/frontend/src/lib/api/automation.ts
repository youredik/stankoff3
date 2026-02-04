import { apiClient } from './client';

// Типы триггеров
export type TriggerType =
  | 'on_create'
  | 'on_status_change'
  | 'on_field_change'
  | 'on_assign'
  | 'on_comment';

// Типы действий
export type ActionType =
  | 'set_status'
  | 'set_assignee'
  | 'set_priority'
  | 'set_field'
  | 'send_notification'
  | 'send_email'
  | 'evaluate_dmn';

// Операторы условий
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value?: any;
}

export interface RuleAction {
  type: ActionType;
  config: {
    status?: string;
    assigneeId?: string | null;
    assigneeMode?: 'specific' | 'creator' | 'round_robin';
    priority?: 'low' | 'medium' | 'high';
    fieldId?: string;
    fieldValue?: any;
    recipientMode?: 'assignee' | 'creator' | 'specific' | 'all_workspace_members';
    recipientId?: string;
    message?: string;
    subject?: string;
    // Для EVALUATE_DMN
    decisionTableId?: string;
    inputMapping?: Record<string, string>;
    outputMapping?: Record<string, string>;
    applyOutputToEntity?: boolean;
  };
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  trigger: TriggerType;
  triggerConfig?: {
    fromStatus?: string | string[];
    toStatus?: string | string[];
    fieldId?: string;
  };
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
  priority: number;
  executionCount: number;
  lastExecutedAt?: string;
  createdById?: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleDto {
  name: string;
  description?: string;
  workspaceId: string;
  trigger: TriggerType;
  triggerConfig?: {
    fromStatus?: string | string[];
    toStatus?: string | string[];
    fieldId?: string;
  };
  conditions?: RuleCondition[];
  actions: RuleAction[];
  isActive?: boolean;
  priority?: number;
}

export type UpdateRuleDto = Partial<Omit<CreateRuleDto, 'workspaceId'>>;

export const automationApi = {
  getByWorkspace: (workspaceId: string) =>
    apiClient
      .get<AutomationRule[]>('/automation', { params: { workspaceId } })
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<AutomationRule>(`/automation/${id}`).then((r) => r.data),

  create: (data: CreateRuleDto) =>
    apiClient.post<AutomationRule>('/automation', data).then((r) => r.data),

  update: (id: string, data: UpdateRuleDto) =>
    apiClient.put<AutomationRule>(`/automation/${id}`, data).then((r) => r.data),

  toggle: (id: string) =>
    apiClient.patch<AutomationRule>(`/automation/${id}/toggle`).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/automation/${id}`),
};

// Хелперы для отображения
export const triggerLabels: Record<TriggerType, string> = {
  on_create: 'При создании заявки',
  on_status_change: 'При изменении статуса',
  on_field_change: 'При изменении поля',
  on_assign: 'При назначении исполнителя',
  on_comment: 'При добавлении комментария',
};

export const actionLabels: Record<ActionType, string> = {
  set_status: 'Установить статус',
  set_assignee: 'Назначить исполнителя',
  set_priority: 'Установить приоритет',
  set_field: 'Установить значение поля',
  send_notification: 'Отправить уведомление',
  send_email: 'Отправить email',
  evaluate_dmn: 'Выполнить DMN таблицу',
};

export const operatorLabels: Record<ConditionOperator, string> = {
  equals: 'равно',
  not_equals: 'не равно',
  contains: 'содержит',
  not_contains: 'не содержит',
  is_empty: 'пусто',
  is_not_empty: 'не пусто',
  greater_than: 'больше',
  less_than: 'меньше',
};
