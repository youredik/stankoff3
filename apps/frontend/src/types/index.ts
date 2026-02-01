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

export interface Section {
  id: string;
  name: string;
  fields: Field[];
  order: number;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  prefix: string; // Префикс для номеров заявок: TP, REK и т.д.
  lastEntityNumber: number; // Последний использованный номер
  sections: Section[];
  createdAt: Date;
  updatedAt: Date;
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
