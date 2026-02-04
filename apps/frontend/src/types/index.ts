// Типы для цифровых рабочих мест и сущностей

export type FieldType =
  | 'text'
  | 'textarea'  // Многострочный текст
  | 'number'
  | 'date'
  | 'select'
  | 'status'   // Специальный тип - определяет колонки канбана
  | 'user'
  | 'file'
  | 'relation';

export interface FieldOption {
  id: string;
  label: string;
  color?: string;  // Цвет для статусов и select
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
