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
- `/dashboard` - Канбан-доска и аналитика (защищённая, переключение через Header)
- `/workspace/[id]/settings` - Настройки рабочего места (Workspace Builder)
- `/workspace/[id]/processes` - Управление бизнес-процессами (определения, экземпляры, редактор BPMN)
- `/admin/users` - Управление пользователями (только admin)

#### Компоненты

**Auth**
- `AuthProvider.tsx` - Защита маршрутов и проверка авторизации

**Admin**
- `UserList.tsx` - Таблица пользователей с поиском, CRUD операциями
- `UserModal.tsx` - Модальное окно создания/редактирования пользователя

**Kanban**
- `KanbanBoard.tsx` - Основной контейнер с DndContext, фильтрами и индикатором режима просмотра
- `KanbanColumn.tsx` - Droppable колонка статуса (динамические из workspace)
- `KanbanCard.tsx` - Draggable карточка сущности (отключается для viewer)
- `EntityDetailPanel.tsx` - Модальное окно сущности с комментариями, вложениями, кастомными полями, ML-рекомендациями исполнителей и tooltips на заблокированных элементах
- `CreateEntityModal.tsx` - Создание новой сущности с поддержкой кастомных полей из структуры workspace
- `FilterPanel.tsx` - Панель фильтрации по всем полям

> **Кастомные поля:** Поля, определённые в структуре workspace (sections → fields), автоматически отображаются при просмотре и создании сущности. Системные поля (status, title, assignee, priority) обрабатываются отдельно. Значения кастомных полей хранятся в `entity.data` (JSONB).

**Entity**
- `CommentEditor.tsx` - Rich text редактор с Tiptap, @mentions и вложениями
- `LinkedEntities.tsx` - Управление связями между сущностями
- `ActivityPanel.tsx` - История активности по сущности (создание, изменения, комментарии)

**Workspace**
- `WorkspaceBuilder.tsx` - Drag & Drop конструктор рабочих мест (редактирование названия, иконки, секций и полей)
- `WorkspaceMembers.tsx` - Управление участниками workspace с ролями
- `AutomationRules.tsx` - Управление правилами автоматизации (триггеры, условия, действия)
- `FieldPalette.tsx` - Палитра типов полей
- `FieldEditor.tsx` - Редактор свойств полей
- `SectionCard.tsx` - Секция с полями

**Section (Разделы)**
- `SectionMembersModal.tsx` - Модальное окно управления участниками раздела (добавление, удаление, изменение ролей viewer/admin)

**Layout**
- `Header.tsx` - Шапка с поиском, переключателем вида (Канбан/Аналитика) и уведомлениями
- `Sidebar.tsx` - Боковое меню с разделами (секциями), группировкой workspaces по разделам, управлением секциями (создание, редактирование, удаление, участники) и выпадающим меню для workspace (дублировать, архивировать, экспорт, импорт)
- `NotificationPanel.tsx` - Выпадающая панель уведомлений с иконками типов и настройкой push-уведомлений
- `GlobalSearch.tsx` - Глобальный поиск по всем заявкам (Cmd+K)

**Analytics**
- `AnalyticsDashboard.tsx` - Дашборд с аналитикой по заявкам (общий вид и по workspace)

**UI**
- `ToastContainer.tsx` - Toast-уведомления с анимациями
- `MediaLightbox.tsx` - Полноэкранный просмотр изображений с навигацией, зумом и скачиванием
- `VideoPlayer.tsx` - Полноэкранный просмотр видео с управлением (пауза, звук, полноэкранный режим)
- `PdfViewer.tsx` - Встроенный просмотр PDF через iframe
- `AttachmentPreview.tsx` - Универсальный компонент превью вложений с поддержкой изображений, видео, PDF и других файлов
- `Skeleton.tsx` - Skeleton loaders для loading states (SkeletonCard, SkeletonColumn, SkeletonSearchResult)
- `ThemeToggle.tsx` - Переключатель темы (светлая/тёмная/системная)
- `Breadcrumbs.tsx` - Навигационные хлебные крошки

**BPMN (Бизнес-процессы)**
- `BpmnModeler.tsx` - Визуальный редактор BPMN диаграмм (bpmn-js Modeler, dynamic import SSR=false)
- `BpmnViewer.tsx` - Просмотр BPMN диаграмм без редактирования (bpmn-js NavigatedViewer)
- `BpmnHeatMap.tsx` - Визуализация статистики на диаграмме (цветовые маркеры активных/завершённых/ошибочных элементов)
- `ProcessEditor.tsx` - Полный редактор процесса (BpmnModeler + форма названия/описания + действия сохранения/деплоя)
- `ProcessList.tsx` - Список определений процессов workspace с возможностью создания и деплоя
- `ProcessInstanceList.tsx` - Список экземпляров процессов (запущенных/завершённых) с раскрываемыми деталями
- `ProcessStatisticsCard.tsx` - Карточка аналитики процесса (активные/завершённые/ошибки/среднее время)
- `ProcessDetailView.tsx` - Детальный просмотр развёрнутого процесса (BpmnHeatMap + статистика)
- `StartProcessModal.tsx` - Модальное окно запуска процесса на сущности
- `TemplateSelector.tsx` - Модальное окно выбора шаблона при создании нового процесса (пустой или из предзаготовленных шаблонов)
- `ProcessMiningDashboard.tsx` - Дашборд аналитики Process Mining (статистика workspace, топ процессов по объёму/длительности, временной анализ, распределение по статусам, детальный анализ выбранного процесса)

**BPMN Tasks (Пользовательские задачи)**
- `tasks/TaskInbox.tsx` - Inbox пользовательских задач с фильтрами (мои/доступные/все) и поиском
- `tasks/TaskCard.tsx` - Карточка задачи в списке (статус, приоритет, срок, исполнитель)
- `tasks/TaskDetail.tsx` - Детальный просмотр задачи с формой, комментариями и историей
- `tasks/TaskActions.tsx` - Кнопки действий (взять/отказаться/завершить/делегировать)

**BPMN Forms (Динамические формы)**
- `forms/DynamicForm.tsx` - Компонент формы на основе JSON Schema с валидацией и поддержкой различных типов полей (text, number, boolean, select, date, textarea)
- `forms/FormViewer.tsx` - Компонент отображения форм User Tasks на основе @bpmn-io/form-js (dynamic import, SSR=false)
- `forms/FormEditor.tsx` - Визуальный drag-and-drop редактор форм (@bpmn-io/form-js-editor) с undo/redo, import/export, preview

**BPMN Triggers (Триггеры процессов)**
- `triggers/TriggersList.tsx` - Список триггеров workspace с управлением (включить/выключить/удалить)
- `triggers/TriggerForm.tsx` - Форма создания/редактирования триггера с настройкой условий

**BPMN Entity Links (Связи сущностей)**
- `entity-links/EntityLinksList.tsx` - Список связей сущности с группировкой по типу связи
- `entity-links/AddLinkModal.tsx` - Модальное окно добавления связи с поиском сущностей

**SLA (Service Level Agreement)**
- `sla/SlaStatusBadge.tsx` - Компактный бейдж со статусом SLA (время до дедлайна, цветовая индикация pending/met/breached)
- `sla/SlaDashboard.tsx` - Дашборд SLA для workspace (статистика: всего/выполнено/нарушено/в процессе/под угрозой)
- `sla/SlaDefinitionForm.tsx` - Форма создания/редактирования определения SLA (время ответа/решения, рабочие часы, условия, эскалация)
- `sla/SlaSettings.tsx` - Страница настроек SLA в workspace (список определений + дашборд)
- `sla/SlaTimer.tsx` - Real-time таймер обратного отсчёта SLA с клиентской интерполяцией между серверными обновлениями, цветовая индикация по срочности (красный <15мин, жёлтый <60мин)

**DMN (Decision Tables)**
- `dmn/DecisionTableEditor.tsx` - Редактор таблиц решений (входные/выходные колонки, правила с условиями, hit policies)
- `dmn/DecisionTableViewer.tsx` - Просмотр таблицы решений с возможностью тестирования и просмотра статистики
- `dmn/DmnSettings.tsx` - Страница настроек DMN в workspace (список таблиц с CRUD)

> **Dynamic Imports:** Все компоненты с bpmn-js используют `dynamic(() => import(...), { ssr: false })`, так как библиотека требует браузерных API (DOM, Canvas).

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
  updateEntityData(id: string, fieldId: string, value: any): Promise<void>; // Обновление кастомного поля
  addComment(entityId: string, content: string, attachments?: UploadedAttachment[]): Promise<void>;
  createEntity(data: CreateEntityData): Promise<void>;  // data может содержать кастомные поля
}
```

**useWorkspaceStore**
```typescript
interface WorkspaceStore {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentRole: WorkspaceRole | null;         // Роль пользователя в текущем workspace
  workspaceRoles: Record<string, WorkspaceRole>; // Роли во всех workspaces
  loading: boolean;

  fetchWorkspaces(): Promise<void>;
  fetchWorkspace(id: string): Promise<void>;
  fetchMyRole(workspaceId: string): Promise<void>;
  fetchMyRoles(): Promise<void>;              // Получить роли во всех workspaces
  createWorkspace(data: Partial<Workspace>): Promise<Workspace>;
  updateWorkspace(id: string, data: Partial<Workspace>): Promise<void>;
  duplicateWorkspace(id: string, name?: string): Promise<Workspace>;
  archiveWorkspace(id: string, isArchived: boolean): Promise<void>;

  // Permission helpers
  canEdit(): boolean;                         // viewer не может редактировать
  canDelete(): boolean;                       // только admin может удалять
  getRoleForWorkspace(workspaceId: string): WorkspaceRole | null;

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
type NotificationType = 'entity' | 'comment' | 'status' | 'assignment' | 'mention' | 'workspace' | 'sla_warning' | 'sla_breach';

interface AppNotification {
  id: string;
  text: string;
  time: Date;
  read: boolean;
  type?: NotificationType;
  entityId?: string;
  workspaceId?: string;
  urgent?: boolean;  // Для SLA breach уведомлений
}

interface NotificationStore {
  notifications: AppNotification[];
  browserNotificationsEnabled: boolean;
  setBrowserNotificationsEnabled(enabled: boolean): void;
  addNotification(data: { text: string; type?: NotificationType; entityId?: string }): void;
  markAllRead(): void;
  markRead(id: string): void;
}
```

> **Browser Push Notifications:** Store использует persist middleware для сохранения настроек. При включённых push-уведомлениях и наличии разрешения браузера, уведомления показываются через Browser Notification API когда вкладка не активна.

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

**useThemeStore**
```typescript
type Theme = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}
```

> Использует persist middleware для сохранения в localStorage. Тема применяется через CSS класс `dark` на `<html>`. Скрипт в layout.tsx предотвращает flash при загрузке.

**useSidebarStore**
```typescript
interface SidebarStore {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}
```

> Управляет состоянием мобильного sidebar. На desktop sidebar всегда видим, на мобильных открывается по клику на burger menu.

**useSectionStore**
```typescript
interface SectionStore {
  sections: MenuSection[];          // Все доступные разделы
  myRoles: Record<string, MenuSectionRole>; // Роли пользователя во всех разделах
  collapsedSections: Set<string>;   // Свёрнутые разделы (в localStorage)
  loading: boolean;
  error: string | null;

  fetchSections(): Promise<void>;
  fetchMyRoles(): Promise<void>;
  createSection(data: CreateSectionData): Promise<MenuSection>;
  updateSection(id: string, data: UpdateSectionData): Promise<void>;
  deleteSection(id: string): Promise<void>;
  reorderSections(sectionIds: string[]): Promise<void>;
  toggleCollapsed(sectionId: string): void;
  isAdmin(sectionId: string): boolean;  // Проверка роли admin в разделе
}
```

> Управляет разделами (секциями) для группировки workspaces. Состояние свёрнутых разделов сохраняется в localStorage.

**useSlaStore**
```typescript
interface SlaUpdate {
  targetId: string;
  targetType: string;
  instanceId: string;
  responseRemainingMinutes: number | null;
  resolutionRemainingMinutes: number | null;
  responseUsedPercent: number | null;
  resolutionUsedPercent: number | null;
  isPaused: boolean;
}

interface SlaStore {
  slaUpdates: Map<string, SlaUpdate>;  // Map для быстрого O(1) доступа
  lastUpdateTime: number;

  setSlaUpdate(targetId: string, update: SlaUpdate): void;
  setSlaUpdates(updates: SlaUpdate[]): void;  // Batch update от WebSocket
  getSlaUpdate(targetId: string): SlaUpdate | undefined;
  clearSlaUpdates(): void;
}
```

> Хранит real-time обновления SLA от WebSocket. Backend отправляет batch-обновления каждые 10 секунд, клиент интерполирует значения между обновлениями (1 секунда интервал) для плавного обратного отсчёта.

#### Hooks

**useWebSocket**
Подписывается на WebSocket события:
- `entity:created` - Новая сущность
- `entity:updated` - Обновление сущности
- `status:changed` - Изменение статуса
- `comment:created` - Новый комментарий
- `user:assigned` - Назначение ответственного
- `sla:warning` - SLA приближается к дедлайну (toast уведомление)
- `sla:breached` - SLA нарушен (urgent toast уведомление, показывается дольше)
- `sla:batch-update` - Batch обновления SLA таймеров (каждые 10 сек, сохраняется в useSlaStore)

> **URL подключения:** В браузере используется `window.location.origin` (динамически определяется текущий хост). Nginx проксирует `/socket.io/` на backend. Это позволяет работать на любом окружении (localhost, preprod, production) без изменения конфигурации.

**useBrowserNotifications**
Работа с Browser Notification API:
```typescript
interface UseBrowserNotificationsReturn {
  permission: 'default' | 'granted' | 'denied';
  isSupported: boolean;
  requestPermission(): Promise<boolean>;
  showNotification(title: string, options?: BrowserNotificationOptions): void;
}
```

Также экспортирует синглтон `browserNotifications` для использования вне React-компонентов (в store). Уведомления показываются только когда вкладка не активна (document.hasFocus() === false).

**useFocusTrap**
Focus trap для модальных окон:
```typescript
function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isActive: boolean
): void;
```

> При активации фокус перемещается на первый фокусируемый элемент. Tab/Shift+Tab циклически перемещаются внутри контейнера. При деактивации фокус возвращается на ранее активный элемент.

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
  isArchived: boolean;      // Архивирован ли workspace
  sectionId: string | null; // ID раздела (группировка)
  section: Section | null;  // Связанный раздел
  showInMenu: boolean;      // Отображать в боковом меню (по умолчанию true)
  orderInSection: number;   // Порядок внутри раздела
  sections: WorkspaceSection[];  // Секции с полями (структура workspace)
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

> **Автогенерация номеров:** При создании сущности `customId` генерируется автоматически на сервере в формате `{prefix}-{number}` (например, TP-1340, REK-1341). Номера **глобально уникальны** во всём портале - используется единый счётчик в таблице `global_counters` с пессимистической блокировкой транзакции. Поле customId имеет UNIQUE constraint в БД.

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
emitToWorkspace(workspaceId, event, data)  // Broadcast в workspace
emitToUser(userId, event, data)  // Личное уведомление пользователю

// SLA события (через emitToWorkspace):
// 'sla:warning' - приближается дедлайн
// 'sla:breached' - SLA нарушен
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

**AuditLogModule**
История активности (Audit Log) для отслеживания всех действий в системе.

```typescript
enum AuditActionType {
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

interface AuditLog {
  id: string;
  action: AuditActionType;
  actorId: string | null;    // null для системных действий
  actor: User | null;
  entityId: string | null;
  entity: WorkspaceEntity | null;
  workspaceId: string;
  details: {
    description: string;      // Читаемое описание действия
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    changedFields?: string[];
    fileName?: string;
    commentId?: string;
  };
  createdAt: Date;
}
```

> **Автоматическое логирование:** EntityService и CommentService автоматически записывают в audit log все операции создания, обновления и удаления. История доступна через вкладку "История" в детальной панели сущности.

**EmailModule**
Email уведомления через SMTP.

```typescript
interface EmailService {
  send(options: EmailOptions): Promise<boolean>;
  sendAssignmentNotification(assignee, entity, assignedBy, frontendUrl): Promise<boolean>;
  sendCommentNotification(recipient, entity, commentAuthor, commentPreview, frontendUrl): Promise<boolean>;
  sendStatusChangeNotification(recipient, entity, changedBy, oldStatus, newStatus, frontendUrl): Promise<boolean>;
  sendSlaWarningNotification(recipient, entity, slaName, type, remainingMinutes, usedPercent, frontendUrl): Promise<boolean>;
  sendSlaBreachNotification(recipient, entity, slaName, type, frontendUrl): Promise<boolean>;
}
```

**Переменные окружения:**
- `SMTP_ENABLED` - включить/выключить отправку (по умолчанию false)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - настройки SMTP
- `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` - отправитель

> **Типы уведомлений:** Email отправляется исполнителю при: назначении на заявку, изменении статуса заявки другим пользователем.

**AutomationModule**
Автоматизация действий по событиям (триггеры, условия, действия).

```typescript
enum TriggerType {
  ON_CREATE = 'on_create',           // При создании заявки
  ON_STATUS_CHANGE = 'on_status_change', // При изменении статуса
  ON_FIELD_CHANGE = 'on_field_change',   // При изменении поля
  ON_ASSIGN = 'on_assign',           // При назначении исполнителя
  ON_COMMENT = 'on_comment',         // При добавлении комментария
  SCHEDULED = 'scheduled',           // По расписанию (cron)
}

enum ActionType {
  SET_STATUS = 'set_status',         // Установить статус
  SET_ASSIGNEE = 'set_assignee',     // Назначить исполнителя
  SET_PRIORITY = 'set_priority',     // Установить приоритет
  SET_FIELD = 'set_field',           // Установить значение поля
  SEND_NOTIFICATION = 'send_notification', // Отправить уведомление
  SEND_EMAIL = 'send_email',         // Отправить email
  EVALUATE_DMN = 'evaluate_dmn',     // Вычислить таблицу решений DMN
}

enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CHANGED_TO = 'changed_to',
  CHANGED_FROM = 'changed_from',
}

interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  trigger: TriggerType;
  triggerConfig?: Record<string, any>;  // Настройки триггера
  conditions: RuleCondition[];          // Условия (AND логика)
  actions: RuleAction[];                // Действия (последовательно)
  isEnabled: boolean;
  executionCount: number;
  lastExecutedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface RuleCondition {
  field: string;       // Поле для проверки (status, priority, assigneeId, data.*)
  operator: ConditionOperator;
  value?: any;
}

interface RuleAction {
  type: ActionType;
  config: {
    // SET_STATUS
    status?: string;
    // SET_ASSIGNEE
    assigneeId?: string | null;
    assigneeMode?: 'specific' | 'creator' | 'round_robin';
    // SET_PRIORITY
    priority?: 'low' | 'medium' | 'high';
    // SET_FIELD
    fieldId?: string;
    fieldValue?: any;
    // SEND_NOTIFICATION / SEND_EMAIL
    recipientMode?: 'assignee' | 'creator' | 'specific' | 'all_workspace_members';
    recipientId?: string;
    message?: string;
    subject?: string;
    // EVALUATE_DMN
    decisionTableId?: string;           // ID таблицы решений
    inputMapping?: Record<string, string>; // Маппинг полей entity → DMN input
    outputMapping?: Record<string, string>; // Маппинг DMN output → полей entity
    applyOutputToEntity?: boolean;      // Применить результат к entity
  };
}
```

> **Выполнение правил:** При срабатывании триггера (создание, изменение статуса и т.д.) AutomationService находит все включённые правила для workspace, проверяет условия и выполняет действия. Правила выполняются в порядке приоритета.

**SectionModule**
Разделы для группировки рабочих мест с контролем доступа.

```
section/
├── section.module.ts
├── section.controller.ts       # CRUD разделов и управление участниками
├── section.service.ts          # Логика работы с разделами
├── section.entity.ts           # Section entity
├── section-member.entity.ts    # SectionMember entity
└── dto/
    ├── create-section.dto.ts
    ├── update-section.dto.ts
    ├── add-section-member.dto.ts
    └── update-section-member.dto.ts
```

```typescript
enum SectionRole {
  VIEWER = 'viewer',  // Видит раздел и его workspaces
  ADMIN = 'admin',    // Управляет разделом и его участниками
}

interface Section {
  id: string;
  name: string;
  description?: string;
  icon: string;           // Эмоджи иконка (по умолчанию 📁)
  order: number;          // Порядок сортировки
  workspaces: Workspace[];
  members: SectionMember[];
  createdAt: Date;
  updatedAt: Date;
}

interface SectionMember {
  id: string;
  sectionId: string;
  userId: string;
  user: User;
  role: SectionRole;
  createdAt: Date;
}
```

> **Контроль доступа:** Глобальный admin видит все разделы. Остальные пользователи видят разделы, где они либо участники раздела, либо участники хотя бы одного workspace в разделе. Запрещено удалять непустые разделы (с workspaces).

**BpmnModule**
Интеграция с Camunda 8 Platform для управления бизнес-процессами (BPMN 2.0).

```
bpmn/
├── bpmn.module.ts
├── bpmn.controller.ts       # API для определений и экземпляров
├── bpmn.service.ts          # Логика работы с процессами
├── camunda/
│   └── camunda.service.ts   # Интеграция с Zeebe через @camunda8/sdk
├── dto/
│   ├── create-process-definition.dto.ts
│   ├── start-process.dto.ts
│   └── send-message.dto.ts
└── entities/
    ├── process-definition.entity.ts
    └── process-instance.entity.ts
```

```typescript
interface ProcessDefinition {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  processId: string;        // BPMN Process ID (из XML)
  bpmnXml: string;          // Исходный BPMN XML
  version: number;
  deployedKey?: string;     // Zeebe deployment key
  deployedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ProcessInstance {
  id: string;
  definitionId: string;
  entityId?: string;        // Связанная сущность (заявка)
  workspaceId: string;
  zeebeKey: string;         // Zeebe process instance key
  status: 'active' | 'completed' | 'terminated' | 'incident';
  variables: Record<string, any>;
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**Camunda Integration:**
- Zeebe gRPC API через `@camunda8/sdk`
- Конфигурация: `ZEEBE_ADDRESS`, `ZEEBE_CLIENT_ID`, `ZEEBE_CLIENT_SECRET`
- Deployment: деплой BPMN XML в Zeebe кластер
- Process Instance: создание и отслеживание экземпляров
- Message Correlation: отправка сообщений в процессы

**SlaModule**
Модуль управления SLA (Service Level Agreement) для отслеживания сроков выполнения заявок.

```
sla/
├── sla.module.ts
├── sla.controller.ts       # API для определений и статусов SLA
├── sla.service.ts          # Логика работы с SLA
├── sla-calculator.service.ts # Расчёт дедлайнов с учётом рабочего времени
├── entities/
│   ├── sla-definition.entity.ts  # Определение SLA
│   ├── sla-instance.entity.ts    # Экземпляр SLA для сущности
│   └── sla-event.entity.ts       # События SLA (создание, пауза, нарушение)
└── dto/
    └── create-sla-definition.dto.ts
```

```typescript
interface SlaDefinition {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  appliesTo: 'entity' | 'task' | 'process';  // Тип цели
  conditions: SlaConditions;      // Условия применения (priority, category)
  responseTime?: number;          // Время на первый ответ (минуты)
  resolutionTime?: number;        // Время на решение (минуты)
  warningThreshold: number;       // Порог предупреждения (%)
  businessHoursOnly: boolean;     // Считать только рабочие часы
  businessHours: BusinessHours;   // Рабочие часы
  escalationRules: EscalationRule[]; // Правила эскалации
  isActive: boolean;
  priority: number;               // Приоритет (для выбора при нескольких подходящих)
}

interface BusinessHours {
  start: string;     // "09:00"
  end: string;       // "18:00"
  timezone: string;  // "Europe/Moscow"
  workdays: number[]; // [1,2,3,4,5] (Пн-Пт)
}

interface SlaInstance {
  id: string;
  slaDefinitionId: string;
  targetType: 'entity' | 'task' | 'process';
  targetId: string;
  responseDueAt?: Date;      // Дедлайн первого ответа
  resolutionDueAt?: Date;    // Дедлайн решения
  responseStatus: 'pending' | 'met' | 'breached';
  resolutionStatus: 'pending' | 'met' | 'breached';
  firstResponseAt?: Date;
  resolvedAt?: Date;
  isPaused: boolean;
  totalPausedMinutes: number;
  currentEscalationLevel: number;
}
```

**Ключевые функции:**
- Автоматическое создание SLA экземпляра при создании сущности (EntityService интегрирован с SlaService)
- Автоматическая фиксация первого ответа при добавлении комментария (CommentService)
- Автоматическая фиксация закрытия при переходе в финальный статус (closed, done, resolved, cancelled, completed)
- Расчёт дедлайнов с учётом рабочего времени (пропуск выходных)
- Пауза SLA (например, ожидание ответа клиента)
- Автоматическая проверка нарушений (cron каждую минуту)
- WebSocket уведомления при приближении к дедлайну (`sla:warning`) и нарушении (`sla:breached`)
- Эскалация при приближении к дедлайну
- Дашборд со статистикой (выполнено/нарушено/в риске)

**WebSocket события SLA:**
| Событие | Описание |
|---------|----------|
| `sla:warning` | SLA приближается к дедлайну (достигнут warningThreshold) |
| `sla:breached` | SLA нарушен (дедлайн истёк) |

**Payload WebSocket событий:**
```typescript
interface SlaNotificationPayload {
  workspaceId: string;
  instanceId: string;
  targetType: 'entity' | 'task' | 'process';
  targetId: string;
  type: 'response' | 'resolution';
  definitionName: string;
  dueAt: Date;
  usedPercent?: number;   // только для warning
  threshold?: number;      // только для warning
}
```

**API эндпоинты SLA:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/sla/definitions?workspaceId=:id | Список определений SLA |
| GET | /api/sla/definitions/:id | Детали определения |
| POST | /api/sla/definitions | Создать определение SLA |
| PUT | /api/sla/definitions/:id | Обновить определение |
| DELETE | /api/sla/definitions/:id | Удалить определение |
| GET | /api/sla/status/:targetType/:targetId | Статус SLA для цели |
| GET | /api/sla/dashboard?workspaceId=:id | Статистика SLA |
| POST | /api/sla/instances/:id/pause | Приостановить SLA |
| POST | /api/sla/instances/:id/resume | Возобновить SLA |

**DmnModule**
Модуль таблиц решений (Decision Model and Notation) для бизнес-правил.

```
dmn/
├── dmn.module.ts
├── dmn.controller.ts         # API для таблиц решений
├── dmn.service.ts            # CRUD и вызов evaluator
├── dmn-evaluator.service.ts  # Движок вычисления правил
├── entities/
│   ├── decision-table.entity.ts   # Таблица решений
│   └── decision-evaluation.entity.ts # Лог вычислений
└── dto/
    └── create-decision-table.dto.ts
```

```typescript
type HitPolicy = 'UNIQUE' | 'FIRST' | 'ANY' | 'COLLECT' | 'RULE_ORDER';

interface DecisionTable {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  hitPolicy: HitPolicy;          // Политика выбора правила
  inputColumns: InputColumn[];   // Входные колонки
  outputColumns: OutputColumn[]; // Выходные колонки
  rules: DecisionRule[];         // Правила
  isActive: boolean;
  version: number;
}

interface InputColumn {
  id: string;
  name: string;           // Имя для поиска в inputData
  label: string;          // Отображаемое имя
  type: 'string' | 'number' | 'boolean' | 'date';
}

interface DecisionRule {
  id: string;
  description?: string;
  inputs: Record<string, RuleCondition>;  // Условия по колонкам
  outputs: Record<string, unknown>;       // Выходные значения
}

interface RuleCondition {
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'between' | 'any';
  value: unknown;
  value2?: unknown;  // Для 'between'
}
```

**Hit Policies:**
- `UNIQUE` - только одно правило должно совпасть (предупреждение при нескольких)
- `FIRST` - первое совпавшее правило (по порядку)
- `ANY` - любое совпавшее (все должны давать одинаковый результат)
- `COLLECT` - собрать все совпавшие выходы в массив
- `RULE_ORDER` - все совпавшие в порядке правил

**Операторы условий:**
- `eq`, `neq` - равно/не равно (case-insensitive для строк)
- `gt`, `gte`, `lt`, `lte` - сравнение чисел
- `in`, `not_in` - вхождение в массив
- `contains` - подстрока (case-insensitive)
- `between` - диапазон (value <= x <= value2)
- `any` - любое значение (пропуск условия)

**API эндпоинты DMN:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/dmn/tables?workspaceId=:id | Список таблиц решений |
| GET | /api/dmn/tables/:id | Детали таблицы |
| POST | /api/dmn/tables | Создать таблицу |
| PUT | /api/dmn/tables/:id | Обновить таблицу |
| DELETE | /api/dmn/tables/:id | Удалить таблицу |
| POST | /api/dmn/tables/:id/clone | Клонировать таблицу |
| POST | /api/dmn/evaluate | Вычислить с логированием |
| POST | /api/dmn/evaluate/quick | Быстрое вычисление (без лога) |
| POST | /api/dmn/evaluate/by-name | Вычислить по имени таблицы |
| GET | /api/dmn/tables/:id/evaluations | История вычислений |
| GET | /api/dmn/tables/:id/statistics | Статистика (попадания правил) |
| GET | /api/dmn/evaluations/target/:type/:id | Вычисления для цели |

**Функции Workspace**

Дополнительные операции с рабочими местами:

1. **Дублирование** - создаёт копию workspace со всеми секциями и полями:
   - Генерирует новые UUID для workspace, секций и полей
   - Сбрасывает счётчик номеров (lastEntityNumber = 0)
   - Не копирует сущности, только структуру

2. **Архивирование** - скрывает workspace без удаления данных:
   - Устанавливает флаг `isArchived: true`
   - Архивированные workspace отображаются с приглушённым стилем и иконкой архива
   - Можно разархивировать обратно

3. **Экспорт JSON** - полный бэкап workspace:
   - Включает workspace с настройками секций/полей
   - Включает все сущности с полями
   - Добавляет timestamp экспорта

4. **Экспорт CSV** - табличный экспорт сущностей:
   - Формат с BOM для корректного отображения в Excel
   - Колонки: ID, Номер, Название, Статус, Приоритет, Исполнитель, Дата создания

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
| GET | /api/workspaces/my-roles | Роли пользователя во всех workspaces |
| GET | /api/workspaces/:id | Детали рабочего места |
| GET | /api/workspaces/:id/my-role | Роль пользователя в workspace |
| GET | /api/workspaces/:id/members | Участники workspace |
| POST | /api/workspaces | Создать рабочее место (admin) |
| POST | /api/workspaces/:id/duplicate | Дублировать workspace (admin) |
| POST | /api/workspaces/:id/members | Добавить участника (workspace admin) |
| PUT | /api/workspaces/:id | Обновить структуру (admin) |
| PUT | /api/workspaces/:id/members/:userId | Изменить роль участника |
| PATCH | /api/workspaces/:id/archive | Архивировать/разархивировать (admin) |
| DELETE | /api/workspaces/:id/members/:userId | Удалить участника |
| GET | /api/workspaces/:id/export/json | Экспорт workspace в JSON |
| GET | /api/workspaces/:id/export/csv | Экспорт entities в CSV |
| POST | /api/workspaces/:id/import/json | Импорт entities из JSON |
| POST | /api/workspaces/:id/import/csv | Импорт entities из CSV |
| PATCH | /api/workspaces/:id/section | Изменить раздел workspace |
| PATCH | /api/workspaces/:id/show-in-menu | Показать/скрыть в меню |
| POST | /api/workspaces/reorder | Изменить порядок workspaces |
| GET | /api/sections | Список доступных разделов |
| GET | /api/sections/:id | Детали раздела |
| GET | /api/sections/my-roles | Роли пользователя во всех разделах |
| POST | /api/sections | Создать раздел (только admin) |
| PUT | /api/sections/:id | Обновить раздел |
| DELETE | /api/sections/:id | Удалить раздел (только пустой) |
| POST | /api/sections/reorder | Изменить порядок разделов |
| GET | /api/sections/:id/members | Участники раздела |
| POST | /api/sections/:id/members | Добавить участника |
| PUT | /api/sections/:id/members/:userId | Изменить роль участника |
| DELETE | /api/sections/:id/members/:userId | Удалить участника |
| GET | /api/search | Глобальный FTS поиск (query: q, workspaceId, types, limit) |
| GET | /api/search/entities | FTS поиск по заявкам |
| GET | /api/search/comments | FTS поиск по комментариям |
| GET | /api/analytics/global | Общая аналитика по всем workspace |
| GET | /api/analytics/workspace/:id | Аналитика по workspace |
| POST | /api/files/upload | Загрузить файл в S3 |
| GET | /api/files/signed-url/:key | Получить signed URL для ключа |
| GET | /api/files/download/*path | Скачать файл через прокси (attachment) |
| GET | /api/audit-logs/entity/:entityId | История активности по сущности |
| GET | /api/audit-logs/workspace/:workspaceId | История активности по workspace |
| GET | /api/automation?workspaceId=:id | Список правил автоматизации |
| GET | /api/automation/:id | Детали правила |
| POST | /api/automation | Создать правило (workspace admin) |
| PUT | /api/automation/:id | Обновить правило (workspace admin) |
| PATCH | /api/automation/:id/toggle | Включить/выключить правило |
| DELETE | /api/automation/:id | Удалить правило (workspace admin) |
| GET | /api/bpmn/health | Статус подключения к Camunda/Zeebe |
| GET | /api/bpmn/definitions?workspaceId=:id | Список определений процессов |
| GET | /api/bpmn/definitions/:id | Детали определения процесса |
| POST | /api/bpmn/definitions | Создать/обновить определение процесса |
| POST | /api/bpmn/definitions/:id/deploy | Развернуть процесс в Zeebe |
| GET | /api/bpmn/instances/workspace/:workspaceId | Экземпляры процессов workspace |
| GET | /api/bpmn/instances/entity/:entityId | Экземпляры процессов для сущности |
| POST | /api/bpmn/instances | Запустить экземпляр процесса |
| POST | /api/bpmn/instances/:id/message | Отправить сообщение в процесс |
| GET | /api/bpmn/statistics/definition/:id | Статистика по определению процесса |
| GET | /api/bpmn/statistics/workspace/:workspaceId | Общая статистика процессов workspace |
| GET | /api/bpmn/triggers?workspaceId=:id | Список триггеров процессов |
| GET | /api/bpmn/triggers/:id | Детали триггера |
| POST | /api/bpmn/triggers | Создать триггер |
| PUT | /api/bpmn/triggers/:id | Обновить триггер |
| PATCH | /api/bpmn/triggers/:id/toggle | Включить/выключить триггер |
| DELETE | /api/bpmn/triggers/:id | Удалить триггер |
| GET | /api/bpmn/triggers/:id/executions | История выполнения триггера |
| POST | /api/bpmn/webhooks/:workspaceId/:triggerId | Webhook endpoint для триггеров |
| GET | /api/bpmn/tasks/inbox | Задачи пользователя (inbox) |
| GET | /api/bpmn/tasks | Поиск/фильтрация задач |
| GET | /api/bpmn/tasks/statistics?workspaceId=:id | Статистика по задачам |
| GET | /api/bpmn/tasks/:id | Детали задачи с формой |
| GET | /api/bpmn/tasks/:id/comments | Комментарии задачи |
| POST | /api/bpmn/tasks/:id/claim | Взять задачу |
| POST | /api/bpmn/tasks/:id/unclaim | Отпустить задачу |
| POST | /api/bpmn/tasks/:id/complete | Завершить задачу с данными формы |
| POST | /api/bpmn/tasks/:id/delegate | Делегировать задачу |
| POST | /api/bpmn/tasks/:id/comments | Добавить комментарий к задаче |
| GET | /api/bpmn/entity-links/entity/:entityId | Связи сущности |
| GET | /api/bpmn/entity-links/entity/:entityId/linked | Связанные сущности с деталями |
| GET | /api/bpmn/entity-links/entity/:entityId/type/:type | Связи по типу |
| GET | /api/bpmn/entity-links/statistics?workspaceId=:id | Статистика связей |
| POST | /api/bpmn/entity-links | Создать связь |
| POST | /api/bpmn/entity-links/spawn | Создать сущность и связать |
| DELETE | /api/bpmn/entity-links/:id | Удалить связь |
| GET | /api/bpmn/templates | Список шаблонов процессов (без XML) |
| GET | /api/bpmn/templates/:id | Шаблон с BPMN XML |
| GET | /api/bpmn/templates/category/:category | Шаблоны по категории |
| GET | /api/bpmn/templates/categories | Список категорий с количеством |
| GET | /api/bpmn/templates/search?q=:query | Поиск шаблонов по названию/тегам |
| GET | /api/bpmn/mining/process/:definitionId | Process Mining статистика процесса |
| GET | /api/bpmn/mining/process/:definitionId/time | Анализ времени (дни недели, часы) |
| GET | /api/bpmn/mining/workspace/:workspaceId | Статистика всех процессов workspace |
| GET | /api/entities/recommendations/assignees/:entityId | ML-рекомендации исполнителей |
| POST | /api/entities/recommendations/priority | Рекомендация приоритета |
| POST | /api/entities/recommendations/response-time | Оценка времени ответа |
| GET | /api/entities/recommendations/similar/:entityId | Похожие заявки |
| GET | /api/sla/definitions?workspaceId=:id | Список определений SLA |
| GET | /api/sla/definitions/:id | Детали определения SLA |
| POST | /api/sla/definitions | Создать определение SLA |
| PUT | /api/sla/definitions/:id | Обновить определение SLA |
| DELETE | /api/sla/definitions/:id | Удалить определение SLA |
| GET | /api/sla/status/:targetType/:targetId | Статус SLA для цели |
| GET | /api/sla/dashboard?workspaceId=:id | Статистика SLA |
| POST | /api/sla/instances/:id/pause | Приостановить SLA |
| POST | /api/sla/instances/:id/resume | Возобновить SLA |
| GET | /api/dmn/tables?workspaceId=:id | Список таблиц решений |
| GET | /api/dmn/tables/:id | Детали таблицы решений |
| POST | /api/dmn/tables | Создать таблицу решений |
| PUT | /api/dmn/tables/:id | Обновить таблицу |
| DELETE | /api/dmn/tables/:id | Удалить таблицу |
| POST | /api/dmn/tables/:id/clone | Клонировать таблицу |
| POST | /api/dmn/evaluate | Вычислить с логированием |
| POST | /api/dmn/evaluate/quick | Быстрое вычисление |
| POST | /api/dmn/evaluate/by-name | Вычислить по имени |
| GET | /api/dmn/tables/:id/evaluations | История вычислений |
| GET | /api/dmn/tables/:id/statistics | Статистика правил |
| GET | /api/dmn/evaluations/target/:type/:id | Вычисления для цели |

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
│     sections      │  ◄── Разделы (группы workspaces)
├───────────────────┤
│ id (uuid, PK)     │
│ name              │
│ description       │
│ icon              │  ◄── Эмоджи (по умолчанию 📁)
│ order             │  ◄── Порядок сортировки
│ createdAt         │
│ updatedAt         │
└───────────────────┘
         ▲
         │ sectionId
         │
┌───────────────────┐       ┌───────────────────┐
│ section_members   │       │     workspaces    │
├───────────────────┤       ├───────────────────┤
│ id (uuid, PK)     │       │ id (uuid, PK)     │
│ sectionId (FK)    │──►    │ name              │
│ userId (FK)       │──►    │ icon              │
│ role (enum)       │       │ prefix            │  ◄── Префикс номеров (TP, REK)
│ createdAt         │       │ lastEntityNumber  │  ◄── Счётчик для автогенерации
└───────────────────┘       │ sectionId (FK)    │──► sections.id (nullable)
UNIQUE(sectionId, userId)   │ showInMenu        │  ◄── Отображать в меню (default: true)
                            │ orderInSection    │  ◄── Порядок внутри раздела
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

┌───────────────────┐
│  global_counters  │
├───────────────────┤
│ name (PK)         │  'entity_number'
│ value (int)       │  Текущий номер (глобальный)
└───────────────────┘
```

### Индексы

```sql
-- ====== ENTITIES ======
-- Глобально уникальный номер заявки
CREATE UNIQUE INDEX idx_entities_customid ON entities("customId");

-- Канбан доска (фильтр по workspace + группировка по status)
CREATE INDEX idx_entities_workspace_status ON entities("workspaceId", status);

-- Сортировка по дате внутри workspace
CREATE INDEX idx_entities_workspace_created ON entities("workspaceId", "createdAt" DESC);

-- Аналитика по исполнителям
CREATE INDEX idx_entities_workspace_assignee ON entities("workspaceId", "assigneeId");

-- Фильтр "мои задачи" (partial index)
CREATE INDEX idx_entities_assignee ON entities("assigneeId") WHERE "assigneeId" IS NOT NULL;

-- Сортировка по последней активности
CREATE INDEX idx_entities_last_activity ON entities("workspaceId", "lastActivityAt" DESC NULLS LAST);

-- Поиск по динамическим полям (GIN для JSONB)
CREATE INDEX idx_entities_data_gin ON entities USING GIN (data jsonb_path_ops);

-- Поиск по связанным заявкам
CREATE INDEX idx_entities_linked_gin ON entities USING GIN ("linkedEntityIds");

-- Полнотекстовый поиск
CREATE INDEX idx_entities_search ON entities USING GIN ("searchVector");

-- ====== COMMENTS ======
-- Загрузка комментариев по заявке
CREATE INDEX idx_comments_entity_created ON comments("entityId", "createdAt");

-- Фильтр по автору
CREATE INDEX idx_comments_author ON comments("authorId");

-- Поиск по упомянутым пользователям
CREATE INDEX idx_comments_mentions_gin ON comments USING GIN ("mentionedUserIds");

-- Полнотекстовый поиск
CREATE INDEX idx_comments_search ON comments USING GIN ("searchVector");

-- ====== AUDIT_LOGS ======
-- Поиск по JSONB details
CREATE INDEX idx_audit_details_gin ON audit_logs USING GIN (details jsonb_path_ops);

-- B-tree на description внутри JSONB
CREATE INDEX idx_audit_description ON audit_logs ((details->>'description'));
```

### Полнотекстовый поиск (FTS)

PostgreSQL Full-Text Search с русским языком:

**Поля tsvector:**
- `entities.searchVector` — title (вес A), customId (A), status (B), priority (B), data (C)
- `comments.searchVector` — content

**Триггеры:**
- `entities_search_vector_trigger` — автоматическое обновление при INSERT/UPDATE
- `comments_search_vector_trigger` — автоматическое обновление при INSERT/UPDATE

**API поиска:**
```
GET /api/search?q=текст&workspaceId=uuid&types=entity,comment&limit=50
GET /api/search/entities?q=текст
GET /api/search/comments?q=текст
```

### Кэшированные поля

| Таблица | Поле | Назначение | Обновление |
|---------|------|------------|------------|
| entities | commentCount | Количество комментариев | Триггер на comments |
| entities | lastActivityAt | Последняя активность | Триггер на entities/comments |
| entities | firstResponseAt | Время первого ответа (SLA) | Триггер на comments |
| entities | resolvedAt | Когда закрыта | Устанавливается при смене статуса |

### Materialized Views

Для быстрой аналитики без GROUP BY на больших таблицах:

| View | Описание | Ключ |
|------|----------|------|
| mv_workspace_stats | Статистика по workspace и статусам | (workspaceId, status) |
| mv_assignee_stats | Статистика по исполнителям | (workspaceId, assigneeId) |
| mv_daily_activity | Активность по дням | (workspaceId, activity_date) |

**Обновление:**
```typescript
// Каждые 5 минут через cron или endpoint
await analyticsService.refreshMaterializedViews();
```

### Миграции

**Файлы миграций:** `apps/backend/src/migrations/`

| Timestamp | Название | Описание |
|-----------|----------|----------|
| 1738600000000 | InitialSchema | Baseline текущей схемы |
| 1770126681086 | AddAnalyticsIndexes | B-tree и GIN индексы |
| 1770126700000 | AddFullTextSearch | tsvector, триггеры, FTS индексы |
| 1770126800000 | AddCachedFields | commentCount, lastActivityAt и т.д. |
| 1770126900000 | AddMaterializedViews | mv_workspace_stats и др. |
| 1770300000000 | AddSections | Разделы, section_members, поля workspaces |
| 1770500000000 | AddSlaAndDmnTables | SLA и DMN таблицы (sla_definitions, sla_instances, sla_events, decision_tables, decision_evaluations) |
| 1770600000000 | FixSlaAndDmnTables | Исправление структуры DMN таблиц (переименование колонок, добавление target_type/target_id) |

**Команды:**
```bash
npm run migration:generate -- src/migrations/Name  # Сгенерировать
npm run migration:run                              # Применить
npm run migration:revert                           # Откатить
npm run migration:show                             # Статус
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

### API взаимодействие Frontend ↔ Backend

**Development режим:**
- Frontend (Next.js): `http://localhost:3000`
- Backend (NestJS): `http://localhost:3001`
- Next.js rewrites проксируют `/api/*` запросы на backend через `next.config.ts`:
  ```typescript
  async rewrites() {
    return [{
      source: '/api/:path*',
      destination: 'http://localhost:3001/api/:path*'
    }];
  }
  ```
- В браузере apiClient использует `baseURL: '/api'` → rewrites → backend
- На сервере (SSR) apiClient использует `baseURL: 'http://localhost:3001'`
- Это обеспечивает корректную работу cookies (refresh token) - они отправляются на тот же origin

**Production режим:**
- Nginx проксирует `/api/*` на backend
- Frontend и backend работают на одном домене через reverse proxy

### Keycloak SSO интеграция

**Текущий режим:** Только Keycloak SSO (локальная авторизация отключена)

**Keycloak SSO:**
- OIDC Authorization Code Flow с PKCE
- Auto-provisioning пользователей из Keycloak claims
- Маппинг ролей: realm-admin/admin → admin, manager → manager, остальные → employee
- Поддержка logout через Keycloak
- **Автоматический редирект:** При заходе на `/login` пользователь сразу перенаправляется на Keycloak (без кнопки)

**Настройка Keycloak (для локальной разработки):**
1. Раскомментируйте сервис keycloak в docker-compose.yml
2. Создайте realm "stankoff" в Keycloak Admin Console (http://localhost:8080)
3. Создайте client "stankoff-portal" с настройками:
   - Client authentication: On
   - Valid redirect URIs: http://localhost:3000/*
   - Web origins: http://localhost:3000
4. Скопируйте Client Secret в .env (KEYCLOAK_CLIENT_SECRET)

**Внешний Keycloak (Preprod/Production):**
- URL: `https://new.stankoff.ru/oidc/`
- Realm для preprod: `stankoff-preprod`
- Realm для production: `stankoff` (TBD)
- Client ID: `stankoff-portal`

**⚠️ КРИТИЧЕСКИ ВАЖНО:**
- Realm `stankoff` используется для **другого проекта** и **НЕ ДОЛЖЕН** изменяться или использоваться в этом проекте
- Для preprod окружения **обязательно** использовать realm `stankoff-preprod`
- Для production окружения будет создан отдельный realm (не `stankoff`!)

**Кастомная тема Keycloak:**

Создана кастомная тема страницы входа в корпоративном стиле Stankoff Portal:

- **Директория:** `keycloak-theme/stankoff-portal/`
- **Дизайн:** Бирюзовые акценты (#06b6d4), минималистичный стиль, шрифт Inter
- **Локализация:** Русский и английский языки
- **Применение:** Только к realm `stankoff-preprod` (не к `stankoff`!)
- **Инструкции:** См. `keycloak-theme/README.md`

Структура темы:
```
keycloak-theme/stankoff-portal/login/
├── theme.properties                    # Конфигурация темы
├── resources/css/login.css             # CSS стили
└── messages/messages_ru.properties     # Русская локализация
```

Для установки темы см. инструкции в `keycloak-theme/README.md`.

**API эндпоинты Keycloak:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/auth/keycloak/login | Редирект на Keycloak для авторизации |
| GET | /api/auth/keycloak/callback | Callback после авторизации в Keycloak |
| POST | /api/auth/refresh | Обновление access token через refresh token (cookie) |
| POST | /api/auth/logout | Выход (очистка cookies + Keycloak logout URL) |
| GET | /api/auth/me | Получить текущего пользователя |

**Поток авторизации:**
1. Пользователь заходит на `/login`
2. Автоматический редирект на `/api/auth/keycloak/login`
3. Backend генерирует PKCE challenge и редиректит на Keycloak
4. Пользователь авторизуется в Keycloak
5. Keycloak редиректит на `/api/auth/keycloak/callback?code=...`
6. Backend обменивает code на tokens, создаёт/обновляет пользователя
7. Backend устанавливает refresh token в HttpOnly cookie
8. Backend редиректит на `/dashboard?access_token=...`
9. AuthProvider:
   - Видит `access_token` в URL и НЕ редиректит на /login
   - Сохраняет токен в памяти (Zustand store)
   - Загружает профиль через `/api/auth/me`
   - Очищает `access_token` из URL
10. Пользователь авторизован и остаётся на dashboard

**Защита от цикла редиректов:**
- AuthProvider не редиректит на `/login`, если в URL есть `access_token` (даёт время на обработку)
- Refresh token в HttpOnly cookie используется для обновления access token

### Планируется
- Rate limiting

## Развёртывание

### Development
```bash
npm run docker:up   # PostgreSQL + pgAdmin
npm run dev         # Frontend + Backend
```

### Production

**Файлы конфигурации:**
```
apps/backend/Dockerfile       # Multi-stage build, non-root user, healthcheck
apps/frontend/Dockerfile      # Standalone Next.js, non-root user, healthcheck
docker-compose.prod.yml       # Production compose
nginx/nginx.conf              # Reverse proxy configuration
scripts/backup.sh             # Database backup/restore script
.github/workflows/ci.yml      # CI/CD pipeline
```

**Запуск:**
```bash
# 1. Настроить окружение
cp .env.example .env
# Отредактировать .env с production значениями

# 2. Запустить все сервисы
docker compose -f docker-compose.prod.yml up -d --build

# 3. Проверить статус
docker compose -f docker-compose.prod.yml ps
curl http://localhost/api/health
```

**Сервисы docker-compose.prod.yml:**
| Сервис | Порт | Описание |
|--------|------|----------|
| nginx | 80, 443 | Reverse proxy, SSL termination, rate limiting |
| frontend | 3000 (internal) | Next.js standalone |
| backend | 3001 (internal) | NestJS API |
| postgres | 5432 (internal) | PostgreSQL 16 |

**Nginx features:**
- Reverse proxy для frontend и backend
- WebSocket support для Socket.IO
- Rate limiting (10 req/s для API, 5 req/min для login)
- Gzip compression
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- Static files caching для Next.js
- SSL конфигурация (закомментирована, готова к использованию)

**Backup базы данных:**

Локальные команды:
```bash
./scripts/backup.sh backup              # Создать локальный бэкап
./scripts/backup.sh list                # Список локальных бэкапов
./scripts/backup.sh restore backup.sql.gz  # Восстановить из локального файла
./scripts/backup.sh cleanup             # Удалить старые локальные бэкапы
```

S3 команды:
```bash
./scripts/backup.sh backup-s3           # Создать бэкап и загрузить в S3
./scripts/backup.sh list-s3             # Список бэкапов в S3
./scripts/backup.sh restore-s3          # Восстановить из последнего S3 бэкапа
./scripts/backup.sh restore-s3 path/to/backup.sql.gz  # Восстановить конкретный
./scripts/backup.sh cleanup-s3          # Удалить старые S3 бэкапы
./scripts/backup.sh scheduled           # Полный цикл: backup + S3 + cleanup
```

**Автоматические бэкапы (production):**

Сервис `backup` в docker-compose.prod.yml:
- Запускает бэкапы **раз в час** (cron: `0 * * * *`)
- Автоматически загружает в S3 (Yandex Object Storage)
- Удаляет старые бэкапы (>7 дней по умолчанию)
- Логи: `docker logs stankoff-backup`

Переменные окружения:
| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| S3_BUCKET | Имя S3 бакета | (обязательно) |
| S3_BACKUP_PREFIX | Путь в бакете | backups/postgres |
| BACKUP_RETENTION_DAYS | Хранить бэкапы (дней) | 7 |

### SSL сертификаты (Let's Encrypt)

Автоматическая генерация и продление SSL сертификатов для **bpms.stankoff.ru**.

**Первичная установка:**
```bash
# Генерация сертификата
./scripts/init-ssl.sh admin@stankoff.ru

# Тестирование (Let's Encrypt staging):
STAGING=1 ./scripts/init-ssl.sh admin@stankoff.ru
```

**Автопродление:**
| Сервис | Действие | Интервал |
|--------|----------|----------|
| certbot | Проверка и продление | каждые 12 часов |
| nginx | Перезагрузка сертификатов | каждые 6 часов |

**Файлы:**
```
nginx/nginx.conf        # HTTPS конфигурация с Let's Encrypt
nginx/nginx-init.conf   # Минимальный конфиг для первого запроса сертификата
scripts/init-ssl.sh     # Скрипт первичной генерации сертификата
```

**Docker volumes:**
- `certbot-conf` — сертификаты Let's Encrypt (`/etc/letsencrypt`)
- `certbot-www` — ACME challenge файлы (`/var/www/certbot`)

**Ручное продление:**
```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):

1. **Lint & Type Check** - проверка линтера и типов
2. **Backend Tests** - Jest unit тесты с PostgreSQL
3. **Frontend Tests** - Vitest unit тесты
4. **E2E Tests** - Playwright тесты
5. **Build Docker Images** - сборка и push в GitHub Container Registry
6. **Deploy** - деплой на production (требует настройки)

## Мониторинг и логирование

### Health Checks

**HealthModule** предоставляет эндпоинты для проверки состояния системы:

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/health | Полная информация о здоровье системы |
| GET | /api/health/live | Liveness probe для K8s |
| GET | /api/health/ready | Readiness probe (проверяет БД) |

**Ответ /api/health:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z",
  "uptime": 3600.5,
  "services": { "database": "healthy" },
  "memory": { "heapUsed": 120, "heapTotal": 256, "rss": 300 }
}
```

### Winston Logging

Структурированное логирование через Winston:

- **Development:** Цветной вывод с timestamp в консоль
- **Production:** JSON формат для парсинга (ELK, Datadog)
- **Файлы:** `logs/error.log` (только ошибки), `logs/combined.log` (всё)
- **Ротация:** 10MB max, 5 файлов

**Уровни логов:**
- `debug` - детальная отладка (dev only)
- `info` - информационные сообщения
- `warn` - предупреждения
- `error` - ошибки с stack trace

### Планируется
- Sentry для отслеживания ошибок frontend/backend
- Prometheus метрики
- Grafana dashboards

## Process Mining (Аналитика процессов)

### Описание

Process Mining модуль предоставляет статистическую аналитику выполнения бизнес-процессов. Работает на базе исторических данных из ProcessInstance без внешних ML-зависимостей.

### Структура сервиса

```
bpmn/process-mining/
├── process-mining.service.ts       # Основная логика аналитики
├── process-mining.controller.ts    # REST API endpoints
└── process-mining.service.spec.ts  # Unit тесты
```

### Метрики и статистика

**ProcessStats (статистика процесса)**
```typescript
interface ProcessStats {
  definitionId: string;
  definitionName: string;
  totalInstances: number;       // Всего экземпляров
  completedInstances: number;   // Завершённых
  activeInstances: number;      // Активных
  terminatedInstances: number;  // Отменённых
  completionRate: number;       // % завершения (0-100)
  avgDurationMinutes: number | null;  // Среднее время выполнения
}
```

**TimeAnalysis (анализ по времени)**
```typescript
interface TimeAnalysis {
  dayOfWeekStats: { day: number; count: number; avgDuration: number }[];  // 7 дней
  hourlyStats: { hour: number; count: number; avgDuration: number }[];    // 24 часа
  trendLine: { date: string; count: number }[];  // Тренд по дням
}
```

**WorkspaceStats (статистика workspace)**
```typescript
interface WorkspaceStats {
  totalDefinitions: number;       // Всего определений процессов
  totalInstances: number;         // Всего экземпляров
  statusDistribution: Record<ProcessInstanceStatus, number>;  // Распределение по статусам
  avgCompletionRate: number;      // Средний % завершения
  topProcesses: { id: string; name: string; count: number }[];  // Топ-5 по запускам
}
```

### Применение

- Выявление узких мест в процессах
- Анализ пиковой нагрузки (часы, дни недели)
- Мониторинг эффективности (completion rate)
- Оценка производительности по длительности выполнения

## Библиотека шаблонов процессов

### Описание

Готовые BPMN-шаблоны для быстрого старта с категоризацией и поиском.

### Структура сервиса

```
bpmn/
├── bpmn-templates.service.ts       # Управление шаблонами
├── bpmn-templates.controller.ts    # REST API
├── bpmn-templates.service.spec.ts  # Unit тесты
└── templates/                      # BPMN XML файлы шаблонов
    ├── simple-approval.bpmn
    ├── support-ticket.bpmn
    └── ...
```

### Категории шаблонов

| Категория | Label | Описание |
|-----------|-------|----------|
| approval | Согласование | Процессы утверждения документов, заявок |
| support | Техподдержка | Обработка тикетов, инцидентов |
| hr | HR | Онбординг, отпуска, увольнения |
| finance | Финансы | Платежи, согласование бюджетов |
| operations | Операции | Закупки, логистика |
| it | IT | Заявки на оборудование, доступы |
| other | Прочее | Остальные шаблоны |

### Метаданные шаблона

```typescript
interface BpmnTemplate {
  id: string;           // Уникальный идентификатор
  name: string;         // Название
  description: string;  // Описание
  category: TemplateCategory;
  tags: string[];       // Теги для поиска
  difficulty: 'simple' | 'medium' | 'advanced';
  estimatedDuration: string;  // "1-2 часа", "5-10 мин" и т.д.
  bpmnXml?: string;     // BPMN XML (только при запросе конкретного шаблона)
}
```

### API поиска

Поиск выполняется по:
- Названию шаблона (частичное совпадение, регистронезависимо)
- Описанию
- Тегам

## ML-рекомендации (Recommendations)

### Описание

Система интеллектуальных рекомендаций на основе статистического анализа. Работает без внешних ML-сервисов, используя алгоритмы скоринга и анализа текста.

### Структура сервиса

```
entity/recommendations/
├── recommendations.service.ts       # Алгоритмы рекомендаций
├── recommendations.controller.ts    # REST API
└── recommendations.service.spec.ts  # Unit тесты
```

### Рекомендации исполнителей

**Алгоритм скоринга:**
```typescript
score =
  workloadScore * 0.4 +           // Текущая нагрузка (меньше = лучше)
  completionRateScore * 0.3 +     // Процент завершённых задач
  responseTimeScore * 0.3         // Среднее время ответа

// Результат
interface AssigneeRecommendation {
  userId: string;
  displayName: string;
  score: number;        // 0-100
  reason: string;       // "Низкая нагрузка, высокий % завершения"
  currentWorkload: number;
  avgResponseTimeMinutes: number;
}
```

### Рекомендация приоритета

**Определение по ключевым словам:**
```typescript
const PRIORITY_KEYWORDS = {
  critical: ['срочно', 'критично', 'авария', 'urgent', 'asap', 'emergency'],
  high: ['важно', 'приоритет', 'быстро', 'important', 'high'],
  medium: ['обычный', 'стандартный', 'normal'],
  low: ['не срочно', 'когда будет время', 'low']
};

interface PriorityRecommendation {
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;     // 0-100
  matchedKeywords: string[];
}
```

### Оценка времени ответа

Рассчитывается на основе:
- Исторических данных по похожим заявкам
- Среднего времени ответа в workspace
- Текущей нагрузки команды

```typescript
interface ResponseTimeEstimate {
  estimatedMinutes: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  basedOnSamples: number;   // Количество похожих заявок
}
```

### Поиск похожих заявок

**Алгоритм Jaccard Similarity:**
```typescript
// Извлечение ключевых слов (без стоп-слов RU/EN)
keywords = extractKeywords(title + ' ' + description);

// Сравнение с существующими заявками
similarity = |A ∩ B| / |A ∪ B|  // Jaccard coefficient

interface SimilarEntity {
  entityId: string;
  title: string;
  similarity: number;  // 0-1
  resolution?: string; // Как была решена
}
```

### Стоп-слова

Сервис фильтрует распространённые слова:
- **Русские:** и, в, на, не, что, это, как, для, по, из, с, то, а, о, от...
- **Английские:** the, a, an, and, or, but, in, on, at, to, for, of, is, it...

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
