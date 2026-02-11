// Типы для цифровых рабочих мест и сущностей

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'status'       // Специальный тип - определяет колонки канбана
  | 'user'
  | 'file'
  | 'relation'
  | 'checkbox'
  | 'url'
  | 'geolocation'
  | 'client';

export interface FieldOption {
  id: string;
  label: string;
  color?: string;
  parentId?: string;  // Для иерархических select
}

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  required?: boolean;
  options?: FieldOption[];  // Для select и status
  defaultValue?: any;
  description?: string;
  relatedWorkspaceId?: string;  // Для relation типа
  config?: FieldConfig;   // Type-specific настройки
  rules?: FieldRule[];    // Правила видимости/вычислений
}

// ==================== Field Config (type-specific) ====================

export interface TextFieldConfig {
  maxLength?: number;
  mask?: 'phone' | 'inn' | string;
  trim?: boolean;
}

export interface TextareaFieldConfig {
  maxLength?: number;
  autoResize?: boolean;
  markdown?: boolean;
  collapsible?: boolean;
  collapsedLines?: number;
}

export interface NumberFieldConfig {
  subtype?: 'integer' | 'decimal' | 'money' | 'percent' | 'inn';
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  decimalPlaces?: number;
}

export interface DateFieldConfig {
  includeTime?: boolean;
  quickPicks?: boolean;
  timezone?: string;
}

export interface SelectFieldConfig {
  multiSelect?: boolean;
  searchable?: boolean;
  allowCreate?: boolean;
  cascadeFrom?: string;  // fieldId для зависимого select
}

export interface UserFieldConfig {
  multiSelect?: boolean;
  departmentFilter?: string;
  showOnlineStatus?: boolean;
}

export interface RelationFieldConfig {
  relationType?: 'one-to-one' | 'one-to-many' | 'many-to-many';
  displayFields?: string[];
}

export interface UrlFieldConfig {
  showPreview?: boolean;
}

export interface GeolocationFieldConfig {
  defaultCenter?: { lat: number; lng: number };
  defaultZoom?: number;
}

export interface ClientFieldConfig {
  requiredSubFields?: ('phone' | 'email' | 'telegram' | 'whatsapp' | 'counterparty')[];
  showLegacyPicker?: boolean;
  showCounterparty?: boolean;
}

export type FieldConfig =
  | ({ type: 'text' } & TextFieldConfig)
  | ({ type: 'textarea' } & TextareaFieldConfig)
  | ({ type: 'number' } & NumberFieldConfig)
  | ({ type: 'date' } & DateFieldConfig)
  | ({ type: 'select' } & SelectFieldConfig)
  | ({ type: 'user' } & UserFieldConfig)
  | ({ type: 'relation' } & RelationFieldConfig)
  | ({ type: 'url' } & UrlFieldConfig)
  | ({ type: 'geolocation' } & GeolocationFieldConfig)
  | ({ type: 'client' } & ClientFieldConfig)
  | { type: 'checkbox' }
  | { type: 'status' }
  | { type: 'file' };

// ==================== Field Rules ====================

export type FieldRuleOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in' | 'is_empty' | 'is_not_empty' | 'contains';

export interface FieldRuleCondition {
  fieldId: string;
  operator: FieldRuleOperator;
  value?: any;
}

export type FieldRuleType = 'visibility' | 'computed' | 'required_if';

export interface FieldRuleAction {
  visible?: boolean;
  formula?: string;
  required?: boolean;
}

export interface FieldRule {
  id: string;
  type: FieldRuleType;
  condition: FieldRuleCondition;  // Обязательно для visibility/required_if, опционально для computed
  action: FieldRuleAction;
}

// ==================== Field Value Types ====================

export interface GeolocationValue {
  address: string;
  lat: number;
  lng: number;
}

export interface ClientFieldValue {
  name?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  whatsapp?: string;
  counterpartyId?: number;
  counterpartyName?: string;
  legacyCustomerId?: number;
}

// Секция внутри структуры workspace (группа полей)
export interface WorkspaceSection {
  id: string;
  name: string;
  fields: Field[];
  order: number;
}

// Устаревший alias - используйте WorkspaceSection
export type Section = WorkspaceSection;

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  prefix: string; // Префикс для номеров заявок: TP, REK и т.д.
  lastEntityNumber: number; // Последний использованный номер
  isArchived?: boolean; // Архивирован ли workspace
  isInternal?: boolean; // Внутренний workspace (не отображается в UI)
  sectionId?: string | null; // ID раздела (MenuSection)
  section?: MenuSection | null; // Раздел, к которому принадлежит workspace
  showInMenu: boolean; // Показывать в боковом меню
  orderInSection: number; // Порядок внутри раздела
  sections: WorkspaceSection[]; // Структура полей workspace
  members?: WorkspaceMember[];
  createdAt: Date;
  updatedAt: Date;
}

export type WorkspaceRole = 'viewer' | 'editor' | 'admin';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  user?: User;
  role: WorkspaceRole;
  roleId?: string | null;
  workspaceRole?: Role | null;
  createdAt: Date;
}

// Раздел меню для группировки workspaces
export interface MenuSection {
  id: string;
  name: string;
  description?: string | null;
  icon: string;
  order: number;
  workspaces?: Workspace[];
  members?: MenuSectionMember[];
  createdAt: Date;
  updatedAt: Date;
}

export type MenuSectionRole = 'viewer' | 'admin';

export interface MenuSectionMember {
  id: string;
  sectionId: string;
  userId: string;
  user?: User;
  role: MenuSectionRole;
  roleId?: string | null;
  sectionRole?: Role | null;
  createdAt: Date;
}

export interface Entity {
  id: string;
  customId: string;
  workspaceId: string;
  title: string;
  status: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: User;
  assigneeId?: string;
  data: Record<string, any>;
  linkedEntityIds?: string[];
  comments?: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkedEntity {
  id: string;
  entityId: string;
  workspaceType: string;
  workspaceName: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  department?: string;
  role: UserRole;
  isActive: boolean;
}

export type UserRole = 'admin' | 'manager' | 'employee';

// ── RBAC ──────────────────────────────────────

export type RoleScope = 'global' | 'section' | 'workspace';

export interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  scope: RoleScope;
  permissions: string[];
  isSystem: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionGroup {
  category: string;
  permissions: PermissionMeta[];
}

export interface PermissionMeta {
  key: string;
  label: string;
  description: string;
  category: string;
  scope: string;
}

export interface MyPermissions {
  global: string[];
  workspaces: Record<string, string[]>;
}

export interface Comment {
  id: string;
  entityId: string;
  author: User;
  content: string;
  mentions?: User[];
  attachments?: Attachment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  url: string;
  mimeType: string;
  thumbnailUrl?: string;
  key?: string; // S3 ключ для скачивания через /api/files/download
}

// Attachment после загрузки (содержит S3 ключи и временные URL для превью)
export interface UploadedAttachment {
  id: string;
  name: string;
  size: number;
  key: string;
  mimeType: string;
  thumbnailKey?: string;
  // Временные signed URLs для превью в редакторе
  url: string;
  thumbnailUrl?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'assignment' | 'comment' | 'status_change' | 'mention';
  title: string;
  message: string;
  entityId?: string;
  read: boolean;
  createdAt: Date;
}

// WebSocket события
export type WebSocketEvent =
  | 'entity:created'
  | 'entity:updated'
  | 'entity:deleted'
  | 'comment:created'
  | 'status:changed'
  | 'user:assigned';

export interface WebSocketMessage<T = any> {
  event: WebSocketEvent;
  data: T;
  timestamp: Date;
}

// Audit Log
export enum AuditActionType {
  ENTITY_CREATED = 'entity:created',
  ENTITY_UPDATED = 'entity:updated',
  ENTITY_DELETED = 'entity:deleted',
  ENTITY_STATUS_CHANGED = 'entity:status:changed',
  ENTITY_ASSIGNEE_CHANGED = 'entity:assignee:changed',
  COMMENT_CREATED = 'comment:created',
  COMMENT_UPDATED = 'comment:updated',
  COMMENT_DELETED = 'comment:deleted',
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

export interface AuditLog {
  id: string;
  action: AuditActionType;
  actor: User | null;
  actorId: string | null;
  entity?: Entity | null;
  entityId: string | null;
  workspaceId: string;
  details: AuditLogDetails;
  createdAt: string;
}

// BPMN Process Types
export interface ProcessDefinition {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  processId: string;
  bpmnXml: string;
  version: number;
  deployedKey?: string;
  isActive: boolean;
  isDefault: boolean;
  createdBy?: User;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  deployedAt?: string;
}

export type ProcessInstanceStatus = 'active' | 'completed' | 'terminated' | 'incident';

export interface ProcessInstance {
  id: string;
  workspaceId: string;
  entityId?: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  processInstanceKey: string;
  businessKey?: string;
  status: ProcessInstanceStatus;
  variables: Record<string, unknown>;
  startedBy?: User;
  startedById?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface BpmnHealthStatus {
  connected: boolean;
  brokers?: number;
}

export interface ProcessDefinitionStatistics {
  total: number;
  active: number;
  completed: number;
  terminated: number;
  incident: number;
  avgDurationMs: number | null;
}

export interface WorkspaceProcessStatistics {
  definitions: number;
  deployedDefinitions: number;
  totalInstances: number;
  activeInstances: number;
  completedInstances: number;
}

export interface BpmnTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  bpmnXml: string;
}

// ==================== User Tasks ====================

export type UserTaskStatus = 'created' | 'claimed' | 'completed' | 'cancelled' | 'delegated';

export interface UserTask {
  id: string;
  processInstanceId: string;
  workspaceId: string;
  entityId?: string;
  entity?: Entity;
  jobKey: string;
  elementId: string;
  elementName?: string;
  taskType: string;
  formKey?: string;
  formSchema?: FormSchema;
  formData: Record<string, unknown>;
  formDefinition?: FormDefinition;
  assigneeId?: string;
  assignee?: User;
  assigneeEmail?: string;
  candidateGroups: string[];
  candidateUsers: string[];
  dueDate?: string;
  followUpDate?: string;
  priority: number;
  status: UserTaskStatus;
  claimedAt?: string;
  claimedById?: string;
  claimedBy?: User;
  completedAt?: string;
  completedById?: string;
  completedBy?: User;
  completionResult?: Record<string, unknown>;
  history: UserTaskHistoryEntry[];
  processVariables: Record<string, unknown>;
  comments?: UserTaskComment[];
  createdAt: string;
  updatedAt: string;
}

export interface UserTaskHistoryEntry {
  action: string;
  userId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface UserTaskComment {
  id: string;
  taskId: string;
  userId: string;
  user?: User;
  content: string;
  createdAt: string;
}

export interface UserTaskFilter {
  workspaceId?: string;
  status?: UserTaskStatus | UserTaskStatus[];
  assigneeId?: string;
  candidateGroup?: string;
  dueBeforeDate?: string;
  taskType?: string;
  entityId?: string;
  page?: number;
  perPage?: number;
  sortBy?: 'createdAt' | 'priority' | 'dueDate';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ==================== Forms ====================

export interface FormSchema {
  $id: string;
  type: 'object';
  title: string;
  description?: string;
  required?: string[];
  properties: Record<string, FormFieldSchema>;
  ui?: FormUISchema;
}

export interface FormFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  title: string;
  description?: string;
  default?: unknown;
  // String specifics
  format?: 'date' | 'date-time' | 'email' | 'uri' | 'textarea' | 'richtext';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // Number specifics
  minimum?: number;
  maximum?: number;
  // Enum (select/radio)
  enum?: unknown[];
  enumNames?: string[];
  // Array specifics
  items?: FormFieldSchema;
  minItems?: number;
  maxItems?: number;
  // Custom extensions
  'x-component'?: string;
  'x-options'?: Record<string, unknown>;
}

export interface FormUISchema {
  'ui:order'?: string[];
  [fieldName: string]: {
    'ui:widget'?: string;
    'ui:placeholder'?: string;
    'ui:help'?: string;
    'ui:disabled'?: boolean;
    'ui:hidden'?: boolean;
    'ui:options'?: Record<string, unknown>;
  } | string[] | undefined;
}

export interface FormDefinition {
  id: string;
  workspaceId?: string;
  key: string;
  name: string;
  description?: string;
  schema: FormSchema;
  uiSchema?: FormUISchema;
  version: number;
  isActive: boolean;
  createdById?: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

// ==================== Process Triggers ====================

export type TriggerType =
  | 'entity_created'
  | 'status_changed'
  | 'assignee_changed'
  | 'comment_added'
  | 'cron'
  | 'webhook'
  | 'message';

export interface TriggerConditions {
  entityTypes?: string[];
  fromStatus?: string;
  toStatus?: string;
  onlyWhenAssigned?: boolean;
  expression?: string;
  timezone?: string;
  secret?: string;
  allowedIps?: string[];
  priority?: string;
  category?: string;
  customExpression?: string;
}

export interface VariableMappings {
  [variableName: string]: string;
}

export interface ProcessTrigger {
  id: string;
  processDefinitionId: string;
  processDefinition?: ProcessDefinition;
  workspaceId: string;
  triggerType: TriggerType;
  conditions: TriggerConditions;
  variableMappings: VariableMappings;
  isActive: boolean;
  lastTriggeredAt?: string;
  triggerCount: number;
  name?: string;
  description?: string;
  createdById?: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export type TriggerExecutionStatus = 'pending' | 'success' | 'failed' | 'skipped';

export interface TriggerExecution {
  id: string;
  triggerId: string;
  trigger?: ProcessTrigger;
  processInstanceId?: string;
  triggerContext: Record<string, unknown>;
  status: TriggerExecutionStatus;
  errorMessage?: string;
  executedAt: string;
}

// ==================== Entity Links ====================

export type EntityLinkType =
  | 'spawned'
  | 'blocks'
  | 'blocked_by'
  | 'related'
  | 'duplicate'
  | 'parent'
  | 'child';

export interface EntityLink {
  id: string;
  sourceEntityId: string;
  sourceEntity?: Entity;
  targetEntityId: string;
  targetEntity?: Entity;
  linkType: EntityLinkType;
  processInstanceId?: string;
  metadata?: Record<string, unknown>;
  createdById?: string;
  createdBy?: User;
  createdAt: string;
}

// ==================== SLA (Service Level Agreement) ====================

export type SlaTargetType = 'entity' | 'task' | 'process';
export type SlaStatus = 'pending' | 'met' | 'breached';

export interface BusinessHours {
  start: string; // "09:00"
  end: string; // "18:00"
  timezone: string; // "Europe/Moscow"
  workdays: number[]; // [1,2,3,4,5] (Mon-Fri)
}

export interface SlaConditions {
  priority?: string;
  category?: string;
  status?: string;
  [key: string]: unknown;
}

export interface EscalationRule {
  threshold: number; // Percentage (80, 100, 150)
  action: 'notify' | 'escalate';
  targets: string[]; // ['assignee', 'manager', userId]
}

export interface SlaDefinition {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  appliesTo: SlaTargetType;
  conditions: SlaConditions;
  responseTime?: number; // minutes
  resolutionTime?: number; // minutes
  warningThreshold: number; // percentage
  businessHoursOnly: boolean;
  businessHours: BusinessHours;
  escalationRules: EscalationRule[];
  isActive: boolean;
  priority: number;
  createdById?: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface SlaInstance {
  id: string;
  slaDefinitionId: string;
  slaDefinition?: SlaDefinition;
  workspaceId: string;
  targetType: SlaTargetType;
  targetId: string;
  responseDueAt?: string;
  resolutionDueAt?: string;
  responseStatus: SlaStatus;
  resolutionStatus: SlaStatus;
  firstResponseAt?: string;
  resolvedAt?: string;
  isPaused: boolean;
  pausedAt?: string;
  totalPausedMinutes: number;
  currentEscalationLevel: number;
  lastEscalationAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlaStatusInfo {
  instanceId: string;
  definitionName: string;
  responseStatus: SlaStatus;
  resolutionStatus: SlaStatus;
  responseDueAt?: string;
  resolutionDueAt?: string;
  responseRemainingMinutes?: number;
  resolutionRemainingMinutes?: number;
  responseUsedPercent?: number;
  resolutionUsedPercent?: number;
  isPaused: boolean;
  currentEscalationLevel: number;
}

export interface SlaDashboard {
  total: number;
  pending: number;
  met: number;
  breached: number;
  atRisk: number;
}

// ==================== DMN (Decision Tables) ====================

export type HitPolicy = 'UNIQUE' | 'FIRST' | 'ANY' | 'COLLECT' | 'RULE_ORDER';
export type ColumnType = 'string' | 'number' | 'boolean' | 'date';
export type RuleOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'between'
  | 'any';

export interface InputColumn {
  id: string;
  name: string;
  label: string;
  type: ColumnType;
  expression?: string;
}

export interface OutputColumn {
  id: string;
  name: string;
  label: string;
  type: ColumnType;
  defaultValue?: unknown;
}

export interface RuleCondition {
  operator: RuleOperator;
  value: unknown;
  value2?: unknown; // For 'between'
}

export interface DecisionRule {
  id: string;
  description?: string;
  inputs: Record<string, RuleCondition>;
  outputs: Record<string, unknown>;
  priority?: number;
}

export interface DecisionTable {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  hitPolicy: HitPolicy;
  inputColumns: InputColumn[];
  outputColumns: OutputColumn[];
  rules: DecisionRule[];
  isActive: boolean;
  version: number;
  createdById?: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationResult {
  ruleId: string;
  outputs: Record<string, unknown>;
  matched: boolean;
}

export interface DecisionEvaluation {
  id: string;
  decisionTableId: string;
  decisionTable?: DecisionTable;
  targetType?: string;
  targetId?: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  matchedRules: EvaluationResult[];
  evaluationTimeMs: number;
  triggeredBy?: string;
  createdAt: string;
}

export interface EvaluationOutput {
  results: EvaluationResult[];
  finalOutput: Record<string, unknown>;
  matchedCount: number;
  evaluationTimeMs: number;
}

export interface DecisionTableStatistics {
  totalEvaluations: number;
  avgEvaluationTime: number;
  ruleHitCounts: Record<string, number>;
}

// ─── Chat / Messenger ──────────────────────────────────────

export type ConversationType = 'direct' | 'group' | 'entity';
export type MessageType = 'text' | 'voice' | 'system';
export type ParticipantRole = 'owner' | 'admin' | 'member';

export interface ChatParticipant {
  id: string;
  conversationId: string;
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  role: ParticipantRole;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
  mutedUntil: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export interface ChatConversation {
  id: string;
  type: ConversationType;
  name: string | null;
  entityId: string | null;
  workspaceId: string | null;
  createdById: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAuthorId: string | null;
  lastMessageAuthor: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  participants: ChatParticipant[];
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageAttachment {
  id: string;
  name: string;
  size: number;
  key: string;
  mimeType: string;
  thumbnailKey?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  content: string | null;
  type: MessageType;
  replyToId: string | null;
  replyTo: {
    id: string;
    content: string | null;
    author: {
      id: string;
      firstName: string;
      lastName: string;
    };
  } | null;
  attachments: ChatMessageAttachment[];
  voiceKey: string | null;
  voiceDuration: number | null;
  voiceWaveform: number[] | null;
  mentionedUserIds: string[];
  reactions?: ChatMessageReaction[];
  isPinned?: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

export interface ChatMessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ==================== Faceted Search ====================

export interface FacetValueCount {
  value: string;
  count: number;
}

export interface SelectFacet {
  type: 'select';
  values: { value: string; label: string; count: number }[];
}

export interface NumberFacet {
  type: 'number';
  min: number | null;
  max: number | null;
  count: number;
}

export interface DateFacet {
  type: 'date';
  min: string | null;
  max: string | null;
  count: number;
}

export interface CheckboxFacet {
  type: 'checkbox';
  trueCount: number;
  falseCount: number;
  total: number;
}

export interface TextFacet {
  type: 'text';
  values: string[];
  count: number;
}

export interface UserFacet {
  type: 'user';
  values: { value: string; count: number }[];
}

export interface ClientFacet {
  type: 'client';
  count: number;
}

export type FieldFacet = SelectFacet | NumberFacet | DateFacet | CheckboxFacet | TextFacet | UserFacet | ClientFacet;

export interface FacetResult {
  builtIn: {
    status: FacetValueCount[];
    priority: FacetValueCount[];
    assignee: FacetValueCount[];
    createdAt: { min: string | null; max: string | null };
  };
  custom: Record<string, FieldFacet>;
}
