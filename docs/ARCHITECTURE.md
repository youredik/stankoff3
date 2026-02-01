# Архитектура Stankoff Portal

## Обзор системы

Stankoff Portal - это корпоративная система управления цифровыми рабочими местами. Система позволяет создавать гибко настраиваемые рабочие пространства для различных отделов (техподдержка, рекламации и т.д.) с кастомизируемыми полями сущностей.

## Архитектурная диаграмма

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Next.js   │  │   Zustand   │  │   Tiptap    │  │  Socket.IO  │ │
│  │  App Router │  │   Stores    │  │   Editor    │  │   Client    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │         │
│         └────────────────┴────────────────┴────────────────┘         │
│                                   │                                   │
└───────────────────────────────────┼───────────────────────────────────┘
                                    │
                         HTTP/REST  │  WebSocket
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                           BACKEND │                                   │
│  ┌─────────────┐  ┌─────────────┐│┌─────────────┐  ┌─────────────┐   │
│  │   NestJS    │  │   TypeORM   │││  Socket.IO  │  │  AWS SDK    │   │
│  │ Controllers │  │   Entities  │││   Gateway   │  │  S3 Client  │   │
│  └──────┬──────┘  └──────┬──────┘│└──────┬──────┘  └──────┬──────┘   │
│         │                │        │       │                │          │
│         └────────────────┴────────┴───────┴────────────────┘          │
│                                   │                                   │
└───────────────────────────────────┼───────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE                                │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐    │
│  │      PostgreSQL 18.1        │  │     Yandex Object Storage   │    │
│  │  (Docker Compose)           │  │     (S3-compatible)         │    │
│  └─────────────────────────────┘  └─────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

## Модули системы

### Frontend (Next.js 16)

#### Страницы (App Router)
- `/` - Главная страница
- `/workspace/[id]` - Канбан-доска рабочего места
- `/workspace/[id]/settings` - Настройки рабочего места (Workspace Builder)

#### Компоненты

**Kanban**
- `KanbanBoard.tsx` - Основной контейнер с DndContext и фильтрами
- `KanbanColumn.tsx` - Droppable колонка статуса (динамические из workspace)
- `KanbanCard.tsx` - Draggable карточка сущности
- `EntityDetailPanel.tsx` - Модальное окно сущности с комментариями и вложениями
- `CreateEntityModal.tsx` - Создание новой сущности
- `FilterPanel.tsx` - Панель фильтрации по всем полям

**Entity**
- `CommentEditor.tsx` - Rich text редактор с Tiptap, @mentions и вложениями
- `LinkedEntities.tsx` - Управление связями между сущностями

**Workspace**
- `WorkspaceBuilder.tsx` - Drag & Drop конструктор рабочих мест (редактирование названия, иконки, секций и полей)
- `FieldPalette.tsx` - Палитра типов полей
- `FieldEditor.tsx` - Редактор свойств полей
- `SectionCard.tsx` - Секция с полями

**Layout**
- `Header.tsx` - Шапка с поиском и уведомлениями
- `Sidebar.tsx` - Боковое меню с рабочими местами
- `NotificationPanel.tsx` - Выпадающая панель уведомлений с иконками типов

**UI**
- `ToastContainer.tsx` - Toast-уведомления с анимациями

#### Stores (Zustand)

**useEntityStore**
```typescript
interface EntityStore {
  entities: Entity[];           // Все сущности
  selectedEntity: Entity | null; // Выбранная сущность
  comments: Comment[];          // Комментарии выбранной сущности
  users: User[];                // Список пользователей
  loading: boolean;
  error: string | null;

  fetchEntities(workspaceId: string): Promise<void>;
  fetchUsers(): Promise<void>;
  selectEntity(id: string): Promise<void>;
  deselectEntity(): void;
  updateStatus(id: string, status: string): Promise<void>;
  updateAssignee(id: string, assigneeId: string | null): Promise<void>;
  updateLinkedEntities(id: string, linkedEntityIds: string[]): Promise<void>;
  addComment(entityId: string, content: string, attachments?: Attachment[]): Promise<void>;
  createEntity(data: CreateEntityData): Promise<void>;
}
```

**useWorkspaceStore**
```typescript
interface WorkspaceStore {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;

  fetchWorkspaces(): Promise<void>;
  fetchWorkspace(id: string): Promise<void>;
  createWorkspace(data: Partial<Workspace>): Promise<Workspace>;
  updateWorkspace(id: string, data: Partial<Workspace>): Promise<void>;

  // Workspace Builder mutations
  addSection(name: string): void;
  updateSection(sectionId: string, name: string): void;
  removeSection(sectionId: string): void;
  reorderSections(fromIndex: number, toIndex: number): void;
  addField(sectionId: string, field: Field): void;
  updateField(sectionId: string, fieldId: string, data: Partial<Field>): void;
  removeField(sectionId: string, fieldId: string): void;
  moveField(fromSectionId: string, toSectionId: string, fromIndex: number, toIndex: number): void;
  saveWorkspace(): Promise<void>;
}
```

**useNotificationStore**
```typescript
type NotificationType = 'entity' | 'comment' | 'status' | 'assignment' | 'mention';

interface AppNotification {
  id: string;
  text: string;
  time: Date;
  read: boolean;
  type?: NotificationType;
  entityId?: string;
  workspaceId?: string;
}

interface NotificationStore {
  notifications: AppNotification[];
  addNotification(data: { text: string; type?: NotificationType; entityId?: string }): void;
  markAllRead(): void;
  markRead(id: string): void;
}
```

#### Hooks

**useWebSocket**
Подписывается на WebSocket события:
- `entity:created` - Новая сущность
- `entity:updated` - Обновление сущности
- `status:changed` - Изменение статуса
- `comment:created` - Новый комментарий
- `user:assigned` - Назначение ответственного

### Backend (NestJS 11)

#### Модули

**WorkspaceModule**
Управление рабочими местами с настраиваемыми полями.

```typescript
interface Workspace {
  id: string;
  name: string;
  icon: string;
  sections: Section[];  // Секции с полями
  createdAt: Date;
  updatedAt: Date;
}

interface Section {
  id: string;
  name: string;
  fields: Field[];
  order: number;
}

interface FieldOption {
  id: string;
  label: string;
  color?: string;  // Цвет для статусов и select
}

interface Field {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'status' | 'user' | 'file' | 'relation';
  required?: boolean;
  options?: FieldOption[];  // Для select и status
  defaultValue?: any;
  description?: string;
  relatedWorkspaceId?: string;  // Для relation типа
}
```

> **Важно:** Поле типа `status` определяет колонки канбан-доски. Каждый вариант статуса (`FieldOption`) становится отдельной колонкой.

**EntityModule**
Сущности (заявки, рекламации и т.д.) и комментарии.

```typescript
interface WorkspaceEntity {
  id: string;
  customId: string;          // TP-1234, REK-001
  workspaceId: string;
  title: string;
  status: string;
  priority: 'low' | 'medium' | 'high';
  assigneeId: string | null;
  assignee: User;
  data: Record<string, any>; // Динамические поля
  linkedEntityIds: string[]; // Связанные сущности
  comments: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

interface Comment {
  id: string;
  entityId: string;
  authorId: string;
  author: User;
  content: string;           // HTML из Tiptap
  mentionedUserIds: string[];
  attachments: Attachment[];
  createdAt: Date;
  updatedAt: Date;
}
```

**UserModule**
Пользователи системы.

```typescript
interface User {
  id: string;
  email: string;
  password: string;  // @Exclude() - не возвращается в API
  firstName: string;
  lastName: string;
  avatar: string | null;
  department: string | null;
  role: 'admin' | 'manager' | 'employee';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**WebsocketModule**
WebSocket Gateway для real-time обновлений.

```typescript
// События (emit):
emitEntityCreated(entity)    // При создании
emitEntityUpdated(entity)    // При обновлении
emitStatusChanged({id, status, entity})  // При смене статуса
emitCommentCreated(comment)  // При добавлении комментария
emitAssigneeChanged({entityId, entity, assigneeId, previousAssigneeId})  // При назначении
```

**S3Module**
Загрузка файлов в Yandex Object Storage.

```typescript
interface S3Service {
  uploadFile(file: Express.Multer.File, path: string): Promise<string>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}
```

#### API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/entities | Список сущностей (query: workspaceId) |
| GET | /api/entities/:id | Детали с комментариями |
| POST | /api/entities | Создать |
| PUT | /api/entities/:id | Обновить |
| PATCH | /api/entities/:id/status | Изменить статус |
| PATCH | /api/entities/:id/assignee | Назначить ответственного |
| DELETE | /api/entities/:id | Удалить |
| GET | /api/comments/entity/:id | Комментарии сущности |
| POST | /api/comments/entity/:id | Добавить комментарий |
| PUT | /api/comments/:id | Редактировать |
| DELETE | /api/comments/:id | Удалить |
| GET | /api/users | Список пользователей |
| GET | /api/workspaces | Список рабочих мест |
| POST | /api/workspaces | Создать рабочее место |
| PUT | /api/workspaces/:id | Обновить структуру |
| POST | /api/files/upload | Загрузить файл в S3 |

## Потоки данных

### 1. Drag & Drop в канбане

```
Пользователь перетаскивает карточку
        │
        ▼
KanbanBoard.handleDragEnd()
        │
        ▼
useEntityStore.updateStatus(id, newStatus)
        │
        ├── Optimistic update: обновить entities в store
        │
        ▼
entitiesApi.updateStatus(id, status)
        │
        ▼
Backend: EntityService.updateStatus()
        │
        ├── Обновить в PostgreSQL
        │
        ▼
EventsGateway.emitStatusChanged()
        │
        ▼
WebSocket → Все клиенты получают событие
        │
        ▼
useWebSocket обновляет store (дедупликация по id)
```

### 2. Добавление комментария

```
Пользователь вводит текст в CommentEditor
        │
        ▼
onSubmit(editor.getHTML())
        │
        ▼
useEntityStore.addComment(entityId, content)
        │
        ▼
commentsApi.create(entityId, {authorId, content})
        │
        ▼
Backend: CommentService.create()
        │
        ├── Сохранить в PostgreSQL
        │
        ▼
EventsGateway.emitCommentCreated(comment)
        │
        ▼
WebSocket → Все клиенты получают событие
        │
        ▼
useWebSocket добавляет комментарий в store
        │
        ▼
Notification добавляется через useNotificationStore
```

### 3. Real-time уведомления

```
Backend эмитит событие (entity:created, comment:created, etc.)
        │
        ▼
useWebSocket получает событие
        │
        ├── Обновляет useEntityStore
        │
        ▼
useNotificationStore.addNotification({text})
        │
        ▼
ToastContainer показывает toast (auto-dismiss 4s)
        │
        ▼
NotificationPanel показывает в списке
```

## База данных

### Схема

```
┌───────────────────┐
│     workspaces    │
├───────────────────┤
│ id (uuid, PK)     │
│ name              │
│ icon              │
│ sections (jsonb)  │◄──────────────────────────┐
│ createdAt         │                           │
│ updatedAt         │                           │
└───────────────────┘                           │
         ▲                                      │
         │ workspaceId                          │
         │                                      │
┌───────────────────┐         ┌───────────────────┐
│     entities      │         │      users        │
├───────────────────┤         ├───────────────────┤
│ id (uuid, PK)     │         │ id (uuid, PK)     │
│ customId          │         │ email (unique)    │
│ workspaceId (FK)  │────────►│ password          │
│ title             │         │ firstName         │
│ status            │         │ lastName          │
│ priority          │         │ avatar            │
│ assigneeId (FK)   │────────►│ department        │
│ data (jsonb)      │         │ role (enum)       │
│ linkedEntityIds   │         │ isActive          │
│ createdAt         │         │ createdAt         │
│ updatedAt         │         │ updatedAt         │
└───────────────────┘         └───────────────────┘
         ▲                              ▲
         │ entityId                     │ authorId
         │                              │
┌───────────────────┐                   │
│     comments      │                   │
├───────────────────┤                   │
│ id (uuid, PK)     │                   │
│ entityId (FK)     │───────────────────┘
│ authorId (FK)     │
│ content (text)    │
│ mentionedUserIds  │
│ attachments       │
│ createdAt         │
│ updatedAt         │
└───────────────────┘
```

### Индексы

```sql
-- Быстрый поиск сущностей по workspace
CREATE INDEX idx_entities_workspace ON entities(workspaceId);

-- Быстрый поиск по статусу
CREATE INDEX idx_entities_status ON entities(status);

-- Быстрый поиск комментариев по entity
CREATE INDEX idx_comments_entity ON comments(entityId);
```

## Безопасность

### Текущая реализация
- `@Exclude()` на password в User entity
- `ClassSerializerInterceptor` глобально для фильтрации полей
- `ValidationPipe` для валидации входящих данных
- CORS настроен для фронтенда

### Планируется
- Keycloak SSO интеграция
- JWT токены
- Rate limiting
- RBAC (Role-Based Access Control)

## Развёртывание

### Development
```bash
npm run docker:up   # PostgreSQL + pgAdmin
npm run dev         # Frontend + Backend
```

### Production (планируется)
```yaml
# docker-compose.prod.yml
services:
  frontend:
    build: ./apps/frontend
    environment:
      - NODE_ENV=production

  backend:
    build: ./apps/backend
    environment:
      - NODE_ENV=production

  postgres:
    image: postgres:18.1
    volumes:
      - pgdata:/var/lib/postgresql/data

  nginx:
    image: nginx:alpine
    # Reverse proxy, SSL termination
```

## Мониторинг и логирование

### Текущее состояние
- Console logging в development
- Docker logs для контейнеров

### Планируется
- Sentry для отслеживания ошибок
- Winston для структурированного логирования
- Prometheus + Grafana для метрик
- Health check endpoints

## Масштабирование

### Горизонтальное масштабирование
- Frontend: статическая сборка, CDN
- Backend: несколько инстансов за load balancer
- WebSocket: Redis adapter для Socket.IO
- База данных: Read replicas

### Кэширование
- Redis для сессий и кэша
- CDN для статических ресурсов
- Browser caching для API responses
