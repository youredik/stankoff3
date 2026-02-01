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
- `/` - Редирект на /dashboard
- `/login` - Страница входа
- `/dashboard` - Канбан-доска (защищённая)
- `/workspace/[id]/settings` - Настройки рабочего места (Workspace Builder)
- `/admin/users` - Управление пользователями (только admin)

#### Компоненты

**Auth**
- `AuthProvider.tsx` - Защита маршрутов и проверка авторизации

**Admin**
- `UserList.tsx` - Таблица пользователей с поиском, CRUD операциями
- `UserModal.tsx` - Модальное окно создания/редактирования пользователя

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
- `WorkspaceMembers.tsx` - Управление участниками workspace с ролями
- `FieldPalette.tsx` - Палитра типов полей
- `FieldEditor.tsx` - Редактор свойств полей
- `SectionCard.tsx` - Секция с полями

**Layout**
- `Header.tsx` - Шапка с поиском и уведомлениями
- `Sidebar.tsx` - Боковое меню с рабочими местами
- `NotificationPanel.tsx` - Выпадающая панель уведомлений с иконками типов

**UI**
- `ToastContainer.tsx` - Toast-уведомления с анимациями
- `MediaLightbox.tsx` - Полноэкранный просмотр изображений с навигацией, зумом и скачиванием
- `PdfViewer.tsx` - Встроенный просмотр PDF через iframe
- `AttachmentPreview.tsx` - Универсальный компонент превью вложений с поддержкой изображений, PDF и других файлов

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
  addComment(entityId: string, content: string, attachments?: UploadedAttachment[]): Promise<void>;
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

**useAuthStore**
```typescript
interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refreshTokens(): Promise<boolean>;
  checkAuth(): Promise<void>;
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

**AuthModule**
JWT аутентификация с Passport.js.

```
auth/
├── auth.module.ts
├── auth.controller.ts       # login, logout, refresh, me
├── auth.service.ts          # validateUser, login, refreshTokens
├── strategies/
│   ├── jwt.strategy.ts      # Проверка access token
│   └── local.strategy.ts    # Логин по email/password
├── guards/
│   ├── jwt-auth.guard.ts    # Глобальный guard
│   ├── local-auth.guard.ts
│   └── roles.guard.ts       # RBAC
├── decorators/
│   ├── current-user.decorator.ts
│   ├── roles.decorator.ts
│   └── public.decorator.ts
└── dto/
    └── login.dto.ts
```

**WorkspaceModule**
Управление рабочими местами с настраиваемыми полями.

```typescript
interface Workspace {
  id: string;
  name: string;
  icon: string;
  prefix: string;           // Префикс для номеров заявок: TP, REK и т.д.
  lastEntityNumber: number; // Счётчик для автогенерации номеров
  sections: Section[];      // Секции с полями
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
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'status' | 'user' | 'file' | 'relation';
  required?: boolean;
  options?: FieldOption[];  // Для select и status
  defaultValue?: any;
  description?: string;
  relatedWorkspaceId?: string;  // Для relation типа
}
```

> **Важно:** Поле типа `status` определяет колонки канбан-доски. Каждый вариант статуса (`FieldOption`) становится отдельной колонкой.

> **Автогенерация номеров:** При создании сущности `customId` генерируется автоматически на сервере в формате `{prefix}-{number}` (например, TP-1249, REK-457). Номера гарантированно уникальны благодаря использованию транзакции с пессимистической блокировкой.

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
Загрузка файлов в приватный Yandex Object Storage с автоматической генерацией превью для изображений и signed URLs для безопасного доступа.

```typescript
interface S3Service {
  uploadFile(file: Express.Multer.File, path: string): Promise<string>;
  uploadFileWithThumbnail(file: Express.Multer.File, path: string): Promise<{key: string; thumbnailKey?: string}>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  getSignedUrlsBatch(keys: string[], expiresIn?: number): Promise<Map<string, string>>;
  getFileStream(key: string): Promise<{stream: NodeJS.ReadableStream; contentType: string; contentLength: number}>;
}

// Хранится в БД (comment.attachments JSONB)
interface StoredAttachment {
  id: string;
  name: string;
  size: number;
  key: string;           // S3 ключ файла
  mimeType: string;
  thumbnailKey?: string; // S3 ключ превью для изображений
}

// Возвращается клиенту (с signed URLs)
interface Attachment {
  id: string;
  name: string;
  size: number;
  url: string;           // Signed URL (1 час)
  mimeType: string;
  thumbnailUrl?: string; // Signed URL превью
}
```

> **Приватный бакет:** Файлы хранятся в приватном S3-бакете. При загрузке возвращаются временные signed URLs для превью. При запросе комментариев backend генерирует свежие signed URLs (1 час) для каждого вложения. Для скачивания файлов используется прокси-эндпоинт `/api/files/download/*path`, который скрывает S3-инфраструктуру и принудительно возвращает файл как attachment (скачивание, а не открытие в браузере).

> **Генерация превью:** При загрузке изображений автоматически создаётся thumbnail 200x200px в формате JPEG с качеством 80%. Превью сохраняется в `/attachments/thumbnails/`.

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
| DELETE | /api/entities/cleanup/test-data | Удалить тестовые данные (E2E) |
| GET | /api/comments/entity/:id | Комментарии сущности |
| POST | /api/comments/entity/:id | Добавить комментарий |
| PUT | /api/comments/:id | Редактировать |
| DELETE | /api/comments/:id | Удалить |
| GET | /api/users | Список пользователей |
| POST | /api/users | Создать пользователя (admin) |
| PUT | /api/users/:id | Обновить пользователя (admin) |
| DELETE | /api/users/:id | Удалить пользователя (admin) |
| GET | /api/workspaces | Список рабочих мест |
| POST | /api/workspaces | Создать рабочее место |
| PUT | /api/workspaces/:id | Обновить структуру |
| POST | /api/files/upload | Загрузить файл в S3 |
| GET | /api/files/signed-url/:key | Получить signed URL для ключа |
| GET | /api/files/download/*path | Скачать файл через прокси (attachment) |

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
│ prefix            │  ◄── Префикс номеров (TP, REK)
│ lastEntityNumber  │  ◄── Счётчик для автогенерации
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

┌───────────────────┐
│ workspace_members │
├───────────────────┤
│ id (uuid, PK)     │
│ workspaceId (FK)  │──► workspaces.id
│ userId (FK)       │──► users.id
│ role (enum)       │  viewer | editor | admin
│ createdAt         │
└───────────────────┘
UNIQUE(workspaceId, userId)
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

### Аутентификация (JWT)

**Backend (AuthModule):**
- JWT Access Token (15 мин) + Refresh Token (7 дней, HttpOnly cookie)
- Passport.js с LocalStrategy и JwtStrategy
- Хеширование паролей через bcrypt
- Guards: JwtAuthGuard, RolesGuard
- Декораторы: @Public(), @Roles(), @CurrentUser()

**Frontend:**
- AuthStore (Zustand) для управления состоянием
- Axios interceptors для автоматической отправки токена
- AuthProvider для защиты маршрутов
- Автоматическое обновление токенов при 401

**API эндпоинты:**
| Метод | URL | Описание |
|-------|-----|----------|
| POST | /api/auth/login | Вход (email, password) |
| POST | /api/auth/refresh | Обновление токенов |
| POST | /api/auth/logout | Выход |
| GET | /api/auth/me | Текущий пользователь |

**WebSocket аутентификация:**
- Токен передаётся через `socket.handshake.auth.token`
- Проверка в handleConnection

### Авторизация (RBAC)

**Роли пользователей:**
| Роль | Описание |
|------|----------|
| `admin` | Полный доступ: управление рабочими местами, сущностями, пользователями |
| `manager` | Управление сущностями: назначение исполнителей, удаление заявок |
| `employee` | Базовый доступ: просмотр, создание заявок, комментарии |

**Backend - защищённые эндпоинты:**

| Эндпоинт | Разрешённые роли |
|----------|------------------|
| `POST /api/workspaces` | admin |
| `PUT /api/workspaces/:id` | admin |
| `DELETE /api/workspaces/:id` | admin |
| `PUT /api/entities/:id` | admin, manager |
| `PATCH /api/entities/:id/assignee` | admin, manager |
| `DELETE /api/entities/:id` | admin, manager |
| `DELETE /api/entities/cleanup/test-data` | admin |
| `POST /api/users` | admin |
| `PUT /api/users/:id` | admin |
| `DELETE /api/users/:id` | admin |

**Глобальные Guards (AppModule):**
```typescript
// Порядок важен: сначала JWT, потом Roles
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
]
```

**Декораторы:**
```typescript
@Public()                          // Открытый эндпоинт (без JWT)
@Roles(UserRole.ADMIN)             // Только admin
@Roles(UserRole.ADMIN, UserRole.MANAGER)  // admin или manager
```

**Frontend - скрытие UI элементов:**

| Компонент | Элемент | Видимость |
|-----------|---------|-----------|
| Sidebar | Кнопка "Создать рабочее место" | только admin |
| Sidebar | Меню настроек/удаления workspace | только admin |
| Sidebar | Раздел "Администрирование" | только admin |
| KanbanBoard | Кнопка "Настройки" | только admin |
| EntityDetailPanel | Выпадающий список исполнителя | admin, manager |
| /admin/users | Вся страница | только admin |

```typescript
// Пример проверки в компоненте
const { user } = useAuthStore();
const isAdmin = user?.role === 'admin';
const canAssign = user?.role === 'admin' || user?.role === 'manager';
```

### RBAC на уровне Workspace

Помимо глобальных ролей, есть роли внутри каждого workspace:

**Роли участников workspace:**
| Роль | Описание |
|------|----------|
| `viewer` | Только просмотр заявок и комментариев |
| `editor` | Создание и редактирование заявок, комментариев |
| `admin` | Полный доступ: настройки workspace, управление участниками |

**Таблица `workspace_members`:**
```sql
workspace_id | user_id | role
```

**Фильтрация workspaces:**
- Глобальный admin видит все workspace
- Остальные пользователи видят только те workspace, где они участники

**API эндпоинты управления участниками:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/workspaces/:id/members | Список участников |
| GET | /api/workspaces/:id/my-role | Роль текущего пользователя |
| POST | /api/workspaces/:id/members | Добавить участника |
| PUT | /api/workspaces/:id/members/:userId | Изменить роль |
| DELETE | /api/workspaces/:id/members/:userId | Удалить участника |

**Проверка прав при работе с entities:**
| Операция | Минимальная роль |
|----------|------------------|
| Просмотр списка entities | viewer |
| Просмотр деталей entity | viewer |
| Создание entity | editor |
| Редактирование entity | editor |
| Изменение статуса | editor |
| Назначение исполнителя | editor |
| Удаление entity | admin (workspace) |
| Создание комментария | editor |
| Редактирование своего комментария | editor (автор) |
| Удаление своего комментария | editor (автор) |
| Редактирование/удаление чужого комментария | admin (workspace) |

**UI управления участниками:**
- Вкладка "Участники" в настройках workspace (только для global admin)
- Добавление пользователей с выбором роли
- Изменение роли существующих участников
- Удаление участников

**UI ограничения для viewer:**
- Скрыта кнопка "Новая заявка"
- Отключено перетаскивание карточек (drag-and-drop)
- Кнопки статуса неактивны
- Скрыт редактор комментариев
- Скрыты кнопки добавления/удаления связей

### Дополнительные меры
- `@Exclude()` на password в User entity
- `ClassSerializerInterceptor` глобально для фильтрации полей
- `ValidationPipe` для валидации входящих данных
- CORS настроен для фронтенда с credentials: true

### Планируется
- Keycloak SSO интеграция
- Rate limiting

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
