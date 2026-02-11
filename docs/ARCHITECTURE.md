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
- `/tasks` - Входящие задачи (глобальный inbox пользовательских задач BPMN из всех workspace'ов)
- `/admin/users` - Управление пользователями (только admin)

#### Компоненты

**Auth**
- `AuthProvider.tsx` - Защита маршрутов и проверка авторизации

**Admin**
- `UserList.tsx` - Таблица пользователей с поиском, CRUD операциями
- `UserModal.tsx` - Модальное окно создания/редактирования пользователя

**Kanban**
- `KanbanBoard.tsx` - Основной контейнер с DndContext, серверной пагинацией и фильтрацией (debounce 300ms)
- `KanbanColumn.tsx` - Droppable колонка статуса с серверным total, кнопкой «Показать ещё» и lazy-loading
- `KanbanCard.tsx` - Draggable карточка сущности (отключается для viewer)
- `EntityDetailPanel.tsx` - Модальное окно сущности с единым таймлайном (комментарии + история), вложениями, кастомными полями, ML-рекомендациями исполнителей и tooltips на заблокированных элементах
- `CreateEntityModal.tsx` - Создание новой сущности с поддержкой кастомных полей из структуры workspace
- `FilterPanel.tsx` - Панель фильтрации по всем полям (поддержка cascadeFrom — фильтрация дочерних опций по выбранному родителю)

> **Кастомные поля:** Поля, определённые в структуре workspace (sections → fields), автоматически отображаются при просмотре и создании сущности. Системные поля (status, title, assignee, priority) обрабатываются отдельно. Значения кастомных полей хранятся в `entity.data` (JSONB). Рендеринг полей — через `fieldRegistry` (единый dispatch, 13 типов). Правила видимости и динамической обязательности (Rule Engine) вычисляются на клиенте через `lib/field-rules.ts`.

**Entity**
- `CommentEditor.tsx` - Rich text редактор с Tiptap, @mentions, вложениями и AI кнопкой генерации ответа
- `LinkedEntities.tsx` - Управление связями между сущностями
- `ActivityPanel.tsx` - История активности по сущности (создание, изменения, комментарии) — хелперы экспортируются для переиспользования
- `AiAssistantTab.tsx` - Вкладка AI помощника (похожие случаи, эксперты, контекст клиента, рекомендации, streaming генерация черновика с вставкой в редактор)

**Entity Timeline** (`components/entity/timeline/`)
- `EntityTimeline.tsx` - Объединённый хронологический таймлайн комментариев и аудит-событий
- `TimelineCommentItem.tsx` - Рендер комментария в таймлайне (аватар, HTML контент, вложения)
- `TimelineAuditItem.tsx` - Рендер аудит-события в таймлайне (иконка по типу, описание, детали изменений)
- `mergeTimeline.ts` - Чистая функция мерджа комментариев и аудит-логов с дедупликацией и хронологической сортировкой

**Workspace**
- `WorkspaceBuilder.tsx` - Drag & Drop конструктор рабочих мест (редактирование названия, иконки, секций и полей)
- `WorkspaceMembers.tsx` - Управление участниками workspace с ролями
- `AutomationRules.tsx` - Управление правилами автоматизации (триггеры, условия, действия)
- `FieldPalette.tsx` - Палитра типов полей (13 типов)
- `FieldEditor.tsx` - Редактор свойств полей (type-specific config, rules)
- `FieldCard.tsx` - Карточка поля в конструкторе
- `RuleBuilder.tsx` - Визуальный конструктор правил (visibility, required_if, computed с формулами)
- `SectionCard.tsx` - Секция с полями

**Fields (Field Registry)**
- `fields/index.ts` - Реестр `fieldRegistry: Record<FieldType, FieldRenderer>` — единая точка dispatch для 13 типов
- `fields/types.ts` - Интерфейсы `FieldRenderer` (Renderer, Form, Filter)
- `fields/TextField.tsx` - Текст (maxLength, маски phone/inn, trim)
- `fields/TextareaField.tsx` - Многострочный (autoResize, collapsible, collapsedLines, markdown → Tiptap RichText)
- `fields/RichTextEditor.tsx` - Tiptap rich text editor (Bold, Italic, Strike, Link, Lists) + RichTextView (read-only HTML)
- `fields/NumberField.tsx` - Число (subtypes: integer/decimal/money/percent/inn, prefix/suffix, min/max)
- `fields/DateField.tsx` - Дата (includeTime → datetime-local, quickPicks: Сегодня/Завтра/+1 нед)
- `fields/SelectField.tsx` - Выбор (multiSelect, searchable, allowCreate — создание вариантов из dropdown, cascadeFrom — каскадные списки по parentId)
- `fields/UserField.tsx` - Пользователь (multiSelect, departmentFilter — фильтр по отделу, showOnlineStatus — зелёная точка у онлайн-пользователей)
- `fields/CheckboxField.tsx` - Чекбокс (toggle switch, три-state фильтр)
- `fields/UrlField.tsx` - Ссылка (OG Preview с кэшированием)
- `fields/GeolocationField.tsx` - Геолокация (Yandex Geocoder, Static Maps, клик на карте)
- `fields/ClientField.tsx` - Клиент (композитный: ФИО, телефон, email, telegram, контрагент, Legacy CRM)
- `fields/FileField.tsx` - Файл (drag & drop upload)
- `fields/RelationField.tsx` - Связь (linked entities)

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
- `BpmnModeler.tsx` - Визуальный редактор BPMN диаграмм с Properties Panel (bpmn-js Modeler + Zeebe Properties Provider, dynamic import SSR=false). Позволяет через UI настраивать свойства элементов: formKey, assignee, candidateGroups, input/output mapping и т.д. При передаче workspaceId — поле "Custom form key" заменяется dropdown'ом с формами workspace
- `FormKeyPropertiesProvider.ts` - Кастомный bpmn-js properties provider (priority 400), заменяет TextFieldEntry на SelectEntry для выбора form key из списка определений форм workspace. Использует React Ref Bridge для передачи данных из React в bpmn-js DI
- `BpmnViewer.tsx` - Просмотр BPMN диаграмм без редактирования (bpmn-js NavigatedViewer, auto-layout для неполных BPMNDI)
- `BpmnHeatMap.tsx` - Тепловая карта процесса с Canvas-based gaussian blur эффектом (radial gradient ауры вокруг элементов, цвет от синего/зелёного до красного по частоте выполнения, бейджи с числами и средним временем, переключатель бейджей). Fallback на CSS-маркеры при отсутствии per-element статистики
- `ProcessEditor.tsx` - Полный редактор процесса (BpmnModeler + форма названия/описания + действия сохранения/деплоя). Принимает workspaceId для передачи в BpmnModeler
- `ProcessList.tsx` - Список определений процессов workspace с возможностью создания и деплоя
- `ProcessInstanceList.tsx` - Список экземпляров процессов (запущенных/завершённых) с раскрываемыми деталями
- `ProcessStatisticsCard.tsx` - Карточка аналитики процесса (активные/завершённые/ошибки/среднее время)
- `ProcessDetailView.tsx` - Детальный просмотр развёрнутого процесса (BpmnHeatMap + статистика)
- `StartProcessModal.tsx` - Модальное окно запуска процесса на сущности
- `TemplateSelector.tsx` - Модальное окно выбора шаблона при создании нового процесса (пустой или из предзаготовленных шаблонов)
- `ProcessMiningDashboard.tsx` - Дашборд аналитики Process Mining (статистика workspace, топ процессов по объёму/длительности, временной анализ, распределение по статусам, детальный анализ выбранного процесса)

**BPMN Tasks (Пользовательские задачи)**
- `tasks/TaskInbox.tsx` - Inbox пользовательских задач с фильтрами (мои/доступные/все), поиском, серверной пагинацией (infinite scroll), сортировкой (дата/приоритет/дедлайн), мультиселектом и batch-операциями (массовый claim/delegate)
- `tasks/TaskCard.tsx` - Карточка задачи в списке (статус, приоритет, срок, исполнитель, чекбокс для мультиселекта)
- `tasks/TaskDetail.tsx` - Детальный просмотр задачи с формой, комментариями и историей
- `tasks/TaskActions.tsx` - Кнопки действий (взять/отказаться/завершить/делегировать)

**BPMN Incidents (Управление инцидентами)**
- `IncidentPanel.tsx` - Панель инцидентов workspace (список зависших процессов с ошибками, кнопки «Повторить»/«Отменить», навигация к связанной сущности)

**BPMN Forms (Динамические формы)**
- `forms/DynamicForm.tsx` - Компонент формы на основе JSON Schema с валидацией и поддержкой различных типов полей (text, number, boolean, select, date, textarea)
- `forms/FormViewer.tsx` - Компонент отображения форм User Tasks на основе @bpmn-io/form-js (dynamic import, SSR=false)
- `forms/FormEditor.tsx` - Визуальный drag-and-drop редактор форм (@bpmn-io/form-js-editor) с undo/redo, import/export, preview
- `forms/FormDefinitionsSettings.tsx` - CRUD управление определениями форм (список, создание, редактирование, предпросмотр, удаление). Встроен как таб «Формы» в WorkspaceBuilder

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

**Onboarding (Обучение)**
- `onboarding/OnboardingProvider.tsx` - Провайдер для автозапуска туров при первом входе
- `onboarding/OnboardingTooltip.tsx` - Интерактивный tooltip с подсветкой элементов и прогресс-баром
- `onboarding/OnboardingStatusCard.tsx` - Карточка прогресса обучения для Dashboard

**Chat (Мессенджер в стиле Telegram)**
- `chat/ChatPage.tsx` - Двухколоночный layout: список бесед (380px) + область сообщений
- `chat/ConversationList.tsx` - Список чатов с поиском и кнопкой создания
- `chat/ConversationItem.tsx` - Карточка беседы: аватар, имя, превью, время, бейдж непрочитанных
- `chat/ChatView.tsx` - Область сообщений: header + message list + input + pinned banner + поиск + меню
- `chat/ChatHeader.tsx` - Шапка чата: имя, онлайн-счётчик, "печатает...", кнопки поиска/меню
- `chat/MessageList.tsx` - Бесконечный скролл вверх, авто-скролл вниз, DateSeparator, группировка, `id` на каждом сообщении для scroll-to
- `chat/MessageBubble.tsx` - Telegram-стиль: свои (зелёные) справа, чужие (белые) слева, SVG хвостик, время + ✓✓, контекстное меню, emoji-реакции (quick picker + ReactionBar), link preview (OG), inline image preview с lightbox, pin-индикатор
- `chat/DateSeparator.tsx` - "Сегодня", "Вчера", "15 января 2026"
- `chat/ChatInput.tsx` - Textarea (Enter=send, Shift+Enter=newline), reply preview, file picker + drag-and-drop + paste, голосовые (MediaRecorder + waveform), typing indicator emit
- `chat/VoicePlayer.tsx` - Play/pause + waveform bars + скорость 1x/1.5x/2x
- `chat/NewChatModal.tsx` - Модал создания личного/группового чата
- `chat/ChatSearchPanel.tsx` - Поиск по сообщениям с debounce, навигация по результатам, scroll-to + highlight
- `chat/ChatMenu.tsx` - Список участников, добавление/удаление, выход из чата

> **Dynamic Imports:** Все компоненты с bpmn-js используют `dynamic(() => import(...), { ssr: false })`, так как библиотека требует браузерных API (DOM, Canvas).

#### Stores (Zustand)

**useEntityStore**
```typescript
interface KanbanColumnState {
  items: Entity[];
  total: number;
  hasMore: boolean;
  loading: boolean;
}

interface EntityStore {
  // Kanban state (серверная пагинация)
  kanbanColumns: Record<string, KanbanColumnState>; // статус → колонка
  kanbanLoading: boolean;
  kanbanFilters: EntityFilters;
  kanbanWorkspaceId: string | null;
  totalAll: number;                  // Общее количество сущностей

  // Backward compat
  entities: Entity[];                // Derived: flatMap из kanbanColumns
  selectedEntity: Entity | null;
  comments: Comment[];
  users: User[];
  loading: boolean;
  error: string | null;

  // Kanban actions
  fetchKanban(workspaceId: string, filters?: EntityFilters): Promise<void>;
  loadMoreColumn(statusId: string): Promise<void>;
  setKanbanFilters(filters: EntityFilters): void;
  getAllEntities(): Entity[];

  // Legacy (backward compat)
  fetchEntities(workspaceId: string): Promise<void>; // → redirect to fetchKanban
  fetchUsers(): Promise<void>;
  selectEntity(id: string): Promise<void>;
  deselectEntity(): void;
  updateStatus(id: string, status: string): Promise<void>;      // Оптимистичное перемещение между колонками
  updateAssignee(id: string, assigneeId: string | null): Promise<void>;
  updateLinkedEntities(id: string, linkedEntityIds: string[]): Promise<void>;
  updateEntityData(id: string, fieldId: string, value: any): Promise<void>;
  addComment(entityId: string, content: string, attachments?: UploadedAttachment[]): Promise<void>;
  createEntity(data: CreateEntityData): Promise<void>;
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
type NotificationType = 'entity' | 'comment' | 'status' | 'assignment' | 'mention' | 'workspace' | 'sla_warning' | 'sla_breach' | 'ai_suggestion';

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

**useTaskStore**
```typescript
interface TaskState {
  inboxCount: number;              // Количество активных задач в inbox
  fetchInboxCount: () => Promise<void>; // Загрузить/обновить количество
}
```

> Хранит количество активных пользовательских задач для бейджа в Sidebar. Polling каждые 60 секунд. Silent fail при недоступности API.

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

**usePresenceStore**
```typescript
interface PresenceState {
  onlineUserIds: Set<string>;
  setOnlineUsers(ids: string[]): void;
  addOnline(userId: string): void;
  removeOnline(userId: string): void;
  isOnline(userId: string): boolean;
}
```

> Хранит список онлайн-пользователей, обновляется через WebSocket событие `presence:update`. Используется в UserField при `showOnlineStatus = true`.

**useAiStore**
```typescript
interface AiState {
  // Кэш подсказок по entityId (TTL 5 мин, зеркалит backend кэш)
  assistanceCache: Map<string, { data: AiAssistantResponse; loadedAt: number }>;
  assistanceLoading: Map<string, boolean>;

  // Кэш классификации по entityId
  classificationCache: Map<string, AiClassification | null>;
  classificationLoading: Map<string, boolean>;

  // Сгенерированный ответ (эфемерный)
  generatedResponse: GeneratedResponse | null;
  isGenerating: boolean;
  streamingDraft: string; // Текст по мере streaming генерации

  // Кэш AI summary переписки
  summaryCache: Map<string, ConversationSummary>;
  summaryLoading: Map<string, boolean>;

  fetchAssistance(entityId: string, forceRefresh?: boolean): Promise<AiAssistantResponse | null>;
  fetchClassification(entityId: string): Promise<AiClassification | null>;
  classifyEntity(entityId: string, title: string, description?: string, workspaceId?: string): Promise<AiClassification | null>;
  applyClassification(entityId: string): Promise<AiClassification | null>;
  generateResponse(entityId: string, additionalContext?: string): Promise<GeneratedResponse | null>;
  generateResponseStream(entityId: string, additionalContext?: string): Promise<GeneratedResponse | null>; // SSE streaming
  fetchSummary(entityId: string): Promise<ConversationSummary | null>;
  onClassificationReady(entityId: string): void;
  invalidateAssistance(entityId: string): void;
  clearAll(): void;
}
```

> Централизованный store для AI данных. Устраняет дублирование API запросов: `AiInsightsPanel` (сайдбар) и `AiAssistantTab` (полная вкладка) делят один кэш. WebSocket событие `ai:classification:ready` обновляет store напрямую через `onClassificationReady()`. Клиентский TTL 5 мин зеркалит серверный кэш `AiAssistantService`.
>
> **Streaming:** `generateResponseStream()` использует native `fetch` + `ReadableStream` для парсинга SSE событий (`data: {"type":"chunk","text":"..."}`) и обновляет `streamingDraft` в реальном времени.
>
> **Summary:** `fetchSummary()` загружает AI-резюме переписки для entity с >= 5 комментариев.
>
> **Sentiment:** `AiAssistantResponse.sentiment` содержит настроение последнего комментария (emoji + label).

#### Hooks

**useWebSocket**
Подписывается на WebSocket события и обновляет kanbanColumns:
- `entity:created` - Добавляет в kanbanColumns[status], увеличивает totalAll
- `entity:updated` - Обновляет entity в соответствующей колонке kanbanColumns
- `status:changed` - Перемещает entity между колонками kanbanColumns (удаляет из старой, добавляет в новую)
- `comment:created` - Новый комментарий
- `user:assigned` - Обновляет assignee в соответствующей колонке kanbanColumns
- `presence:update` - Обновление списка онлайн-пользователей (сохраняется в usePresenceStore)
- `sla:warning` - SLA приближается к дедлайну (toast уведомление)
- `sla:breached` - SLA нарушен (urgent toast уведомление, показывается дольше)
- `sla:batch-update` - Batch обновления SLA таймеров (каждые 10 сек, сохраняется в useSlaStore)
- `task:created` - Новая user task создана (обновляет inboxCount через useTaskStore)
- `task:updated` - User task обновлена (claim/unclaim/complete/delegate/cancel, обновляет inboxCount)
- `task:reminder` - Напоминание о приближающемся дедлайне задачи (за 1 час, отправляется assignee/candidates)
- `task:overdue` - Уведомление о просроченной задаче (отправляется assignee/candidates)
- `process:incident` - Процесс зависнул с ошибкой (worker retries исчерпаны, отправляется в workspace)
- `ai:classification:ready` - AI классификация завершена (обновляет useAiStore, создаёт уведомление `ai_suggestion` при confidence >= 0.7)
- `ai:notification` - Проактивное AI уведомление (кластер заявок, критическая заявка и др.) → обновляет useNotificationStore
- `auth:refresh` - Client → Server: обновление JWT токена без разрыва WebSocket соединения

> **Proactive token refresh:** Фронтенд автоматически обновляет access token за 60 секунд до истечения (без ожидания 401). При обновлении токена отправляет `auth:refresh` событие серверу для переаутентификации WebSocket без reconnect.

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

**useWorkspaceFilters**
Хук для управления фильтрами, изолированными по workspace. Фильтры сохраняются в localStorage и восстанавливаются при возвращении к тому же workspace.
```typescript
function useWorkspaceFilters(
  workspaceId: string
): [FilterState, (filters: FilterState) => void];
```

> Ключ localStorage: `workspace-filters:{workspaceId}`. При смене `workspaceId` загружает сохранённые фильтры для нового workspace. Используется в KanbanBoard и TableView.

### Backend (NestJS 11)

#### Модули

**AuthModule**
JWT аутентификация с Passport.js + Keycloak SSO. Dev Auth Bypass для локальной разработки.

```
auth/
├── auth.module.ts
├── auth.controller.ts       # login, logout, refresh, me, keycloak/*
├── auth.service.ts          # validateUser, login, refreshTokens
├── dev-auth.controller.ts   # Dev Auth Bypass (AUTH_DEV_MODE=true, NODE_ENV!=production)
├── keycloak.service.ts      # Keycloak OIDC (логин через SSO)
├── keycloak-admin.service.ts # Keycloak Admin API (импорт пользователей)
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

**KeycloakAdminService** — управление пользователями через Keycloak Admin REST API:
- `createUser()` — создание пользователя
- `setUserPassword()` — установка пароля (временного)
- `userExistsByEmail()` — проверка существования
- `importLegacyEmployees()` — массовый импорт из legacy
- `generateSecurePassword()` — генерация безопасного пароля

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
  isInternal: boolean;      // Внутренний workspace (скрыт от UI, используется для AI/RAG)
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
  color?: string;       // Цвет для статусов и select
  parentId?: string;    // Для иерархических select (каскадные списки)
}

interface Field {
  id: string;
  name: string;
  type: FieldType;      // 13 типов (см. ниже)
  required?: boolean;
  options?: FieldOption[];      // Для select и status
  defaultValue?: any;
  description?: string;
  relatedWorkspaceId?: string;  // Для relation типа
  config?: FieldConfig;         // Type-specific настройки (maxLength, mask, multiSelect и т.д.)
  rules?: FieldRule[];          // Правила видимости и обязательности
}

type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'select'
  | 'status' | 'user' | 'file' | 'relation'
  | 'checkbox' | 'url' | 'geolocation' | 'client';

// Rule Engine — условные правила для полей
interface FieldRule {
  id: string;
  type: 'visibility' | 'required_if' | 'computed';
  condition: { fieldId: string; operator: FieldRuleOperator; value?: any };
  action: { visible?: boolean; required?: boolean; formula?: string };
}
type FieldRuleOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in' | 'is_empty' | 'is_not_empty' | 'contains';

// Formula Parser (lib/rules/formula-parser.ts)
// Безопасный парсер формул: tokenizer → AST → evaluator (без eval)
// Поддержка: +, -, *, /, (), {fieldId}, round(), ceil(), floor(), abs(), min(), max(), sum()
// Строковая конкатенация: "текст" + {field}
evaluateFormula(formula: string, data: Record<string, any>): number | string | null
validateFormula(formula: string): string | null
extractFieldRefs(formula: string): string[]
```

> **Важно:** Поле типа `status` определяет колонки канбан-доски. Каждый вариант статуса (`FieldOption`) становится отдельной колонкой.

> **Автогенерация номеров:** При создании сущности `customId` генерируется автоматически на сервере в формате `{prefix}-{number}` (например, TP-1340, REK-1341). Номера **глобально уникальны** во всём портале - используется единый счётчик в таблице `global_counters` с пессимистической блокировкой транзакции. Поле customId имеет UNIQUE constraint в БД.

**EntityModule**
Сущности (заявки, рекламации и т.д.), комментарии, OG Preview и серверная валидация полей.

Дополнительные сервисы:
- `FieldValidationService` — валидация `entity.data` по определениям полей workspace (required, тип, config: maxLength, min/max, select options и т.д.). Пропускает required-валидацию для computed полей (определяет по `rules[].type === 'computed'`).
- `FormulaEvaluatorService` — серверный безопасный парсер формул (tokenizer → AST → evaluator, без eval). Пересчитывает значения computed полей в `entity.data` при create/update. Поддержка: арифметика, ссылки на поля `{fieldId}`, строки, функции (round, ceil, floor, abs, min, max, sum).
- `OgPreviewService` — HTTP fetch URL, парсинг OG meta-тегов, in-memory кэш (1 час, 500 записей)
- `OgPreviewController` — `GET /api/og-preview?url=...` (JWT, только http/https)

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
├── bpmn.controller.ts           # API для определений и экземпляров
├── bpmn.service.ts              # Логика работы с процессами
├── bpmn-workers.service.ts      # Регистрация Zeebe worker'ов (9 типов)
├── bpmn-templates.service.ts    # Метаданные BPMN шаблонов
├── camunda/
│   └── camunda.service.ts       # Интеграция с Zeebe через @camunda8/sdk
├── dto/
│   ├── create-process-definition.dto.ts
│   ├── start-process.dto.ts
│   └── send-message.dto.ts
├── entities/
│   ├── process-definition.entity.ts
│   ├── process-instance.entity.ts
│   ├── process-definition-version.entity.ts  # История версий процесса
│   ├── process-activity-log.entity.ts  # Логирование элементов (heat map)
│   ├── user-task.entity.ts      # User task + UserTaskComment (+ reminderSentAt, overdueSentAt)
│   ├── user-group.entity.ts     # Группы пользователей
│   └── form-definition.entity.ts # Определения форм
├── incidents/
│   ├── incident.controller.ts   # API инцидентов (список, retry, cancel)
│   └── incident.service.ts      # Логика инцидентов (автодетект, retry)
├── user-tasks/
│   ├── user-tasks.controller.ts # API inbox, claim, complete, delegate, batch ops
│   ├── user-tasks.service.ts    # Логика работы с user tasks + пагинация
│   ├── user-tasks.worker.ts     # Обработчик Zeebe user task jobs
│   └── user-task-deadline.scheduler.ts # Cron (5 мин): напоминания и overdue уведомления
├── entity-links/
│   ├── entity-links.controller.ts
│   ├── entity-links.service.ts
│   └── create-entity.worker.ts  # Worker для создания связанных сущностей
└── templates/                   # BPMN шаблоны (12 файлов)
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

interface ProcessDefinitionVersion {
  id: string;
  processDefinitionId: string;
  version: number;
  bpmnXml: string;
  deployedKey?: string;
  deployedById?: string;
  changelog?: string;
  deployedAt: Date;
}

interface ProcessActivityLog {
  id: string;
  processInstanceId: string;  // FK → ProcessInstance
  processDefinitionId: string; // FK → ProcessDefinition (быстрая агрегация)
  elementId: string;          // BPMN element ID (Task_UpdateStatus и т.д.)
  elementType: string;        // serviceTask, userTask, etc.
  status: 'success' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  workerType?: string;        // Task type из Zeebe
}
```

**Camunda Integration:**
- Zeebe gRPC API через `@camunda8/sdk`
- Конфигурация: `ZEEBE_ADDRESS`, `ZEEBE_CLIENT_ID`, `ZEEBE_CLIENT_SECRET`
- Deployment: деплой BPMN XML в Zeebe кластер
- Process Instance: создание и отслеживание экземпляров
- Message Correlation: отправка сообщений в процессы

**Zeebe Workers (11 штук в `BpmnWorkersService`):**

| Worker Type | Назначение | Завершение |
|---|---|---|
| `update-entity-status` | Обновляет статус заявки | Мгновенное |
| `send-notification` | In-app уведомление через WebSocket | Мгновенное |
| `send-email` | Отправка email через EmailService | Мгновенное |
| `log-activity` | Запись в audit log (ProcessActivityLog) | Мгновенное |
| `set-assignee` | Назначение исполнителя на заявку | Мгновенное |
| `classify-entity` | AI-классификация через AiClassifierService | Мгновенное |
| `process-completed` | Пометка ProcessInstance как completed | Мгновенное |
| `io.camunda.zeebe:userTask` | **User task** — создаёт задачу в inbox | Отложенное (job.forward) |
| `create-entity` | Создание связанной сущности (cross-workspace) | Мгновенное |
| `suggest-assignee` | AI-подбор исполнителя через AiAssistantService | Мгновенное |
| `check-duplicate` | AI-проверка дубликатов (similarity > 0.95) | Мгновенное |

**User Task Flow (отложенное завершение):**
1. Zeebe активирует job → worker вызывает `UserTasksWorker.handleUserTask()` → создаёт `UserTask` в БД
2. Worker возвращает `job.forward()` — освобождает capacity, но **не завершает** job (timeout: 30 дней)
3. Пользователь видит задачу в inbox → claim → complete с formData
4. `UserTasksService.complete()` → вызывает `BpmnWorkersService.completeUserTaskJob(jobKey, formData)`
5. `completeUserTaskJob()` вызывает `zeebeClient.completeJob({ jobKey, variables })` → Zeebe продолжает процесс

**Incident Management:**
- Workers автоматически определяют инциденты: если `job.retries <= 0` → `IncidentService.markAsIncident()`
- Статус процесса обновляется на `incident`, ошибка сохраняется в `variables.lastError`
- WebSocket `process:incident` уведомляет workspace об инциденте
- Retry: сбрасывает статус на `active`, очищает ошибку. Cancel: терминирует процесс через Zeebe

**Process Versioning:**
- При каждом deploy создаётся запись `ProcessDefinitionVersion` со snapshot BPMN XML
- История версий: `GET /definition/:id/versions` — все версии с changelog и автором
- Откат: `POST /definition/:id/rollback/:version` — восстанавливает XML старой версии и re-deploy

**Deadline Notifications (UserTaskDeadlineScheduler):**
- Cron каждые 5 мин проверяет задачи с приближающимся дедлайном (< 1 час) и просроченные
- Отправляет WebSocket `task:reminder` / `task:overdue` assignee или candidateUsers
- Дедупликация через поля `reminderSentAt`, `overdueSentAt` в UserTask entity

**BPMN шаблоны:**
- 13 шаблонов в `templates/`, все user tasks имеют `<zeebe:taskDefinition type="io.camunda.zeebe:userTask" />`
- Метаданные (name, description, category) в `BpmnTemplatesService` (hardcoded map)
- **Boundary Timer Events:** non-interrupting timers для автоэскалации:
  - `service-support-v2.bpmn`: 4ч таймер на задаче → уведомление руководителю
  - `claims-management.bpmn`: 5 дней на расследование → эскалация руководителю
  - `multi-level-approval.bpmn`: 24ч таймер на каждом уровне → напоминание согласователю

**Message Correlation (BPMN ↔ комментарии):**
- При добавлении комментария от не-исполнителя (клиента) — публикуются Zeebe messages:
  - `client-response` (для `service-support-v2.bpmn` Event-Based Gateway)
  - `customer-response` (для `support-ticket.bpmn`)
- Correlation key: `entityId`
- Если ни один процесс не ожидает message — сообщение игнорируется (TTL 60с)

**Webhook Security (HMAC-SHA256):**
- Webhook триггеры поддерживают два метода аутентификации:
  - **HMAC-SHA256** (рекомендуется): заголовок `X-Webhook-Signature: sha256=<hex>` — timing-safe сравнение
  - **Plain secret** (legacy): заголовок `X-Webhook-Secret: <ключ>` — timing-safe сравнение
- Фронтенд `TriggerForm`: генерация ключа, копирование URL и секрета

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

**LegacyModule**
Интеграция со старой CRM (MariaDB на 185.186.143.38): read-only доступ, миграция данных, синхронизация. Доступ ограничен белым списком IP — подключение только с ВМ препрода (51.250.117.178). Подробная документация: [LEGACY_INTEGRATION.md](./LEGACY_INTEGRATION.md)

```
legacy/
├── legacy.module.ts                    # Отдельный DataSource для MySQL
├── legacy.controller.ts                # REST API для чтения legacy данных
├── legacy-import.controller.ts         # REST API для импорта в Keycloak
├── legacy-migration.controller.ts      # ⭐ REST API миграции данных
├── legacy-database.config.ts           # Конфигурация MySQL
├── entities/                           # TypeORM entities для legacy таблиц
│   ├── legacy-customer.entity.ts       # SS_customers (~296K записей)
│   ├── legacy-product.entity.ts        # SS_products (~28K записей)
│   ├── legacy-category.entity.ts       # SS_categories (~1.6K, category_is_active)
│   ├── legacy-counterparty.entity.ts   # counterparty (~29K записей)
│   ├── legacy-manager.entity.ts        # manager (147 сотрудников)
│   ├── legacy-department.entity.ts     # department (13 отделов)
│   └── legacy-migration-log.entity.ts  # ⭐ Лог миграции (PostgreSQL!)
├── dto/
│   ├── legacy-employee.dto.ts          # DTO для сотрудников
│   └── legacy-migration.dto.ts         # ⭐ DTO для миграции
└── services/
    ├── legacy.service.ts               # Read-only + batch методы
    ├── legacy-url.service.ts           # Генерация URL legacy CRM
    ├── legacy-migration.service.ts     # ⭐ Сервис миграции данных
    └── legacy-sync.service.ts          # ⭐ Cron-синхронизация (каждые 5 мин)
```

**API эндпоинты Legacy:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/legacy/health | Проверка подключения |
| GET | /api/legacy/customers/search | Поиск клиентов (employeesOnly) |
| GET | /api/legacy/customers/:id | Клиент по ID |
| GET | /api/legacy/products/search | Поиск товаров (categoryId, inStockOnly) |
| GET | /api/legacy/products/:id | Товар по ID |
| GET | /api/legacy/categories | Активные категории |
| GET | /api/legacy/counterparties/search | Поиск контрагентов |
| GET | /api/legacy/counterparties/:id | Контрагент по ID |
| GET | /api/legacy/employees/search | ⭐ Поиск сотрудников (departmentId) |
| GET | /api/legacy/employees/all | ⭐ Все активные сотрудники |
| GET | /api/legacy/employees/:id | ⭐ Сотрудник по ID |
| GET | /api/legacy/departments | ⭐ Все отделы |

**API импорта в Keycloak:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/legacy/import/status | Статус готовности к импорту |
| GET | /api/legacy/import/preview | Предпросмотр (кто будет импортирован) |
| POST | /api/legacy/import/employees | Импорт сотрудников (dryRun, skipExisting) |
| POST | /api/legacy/import/employees/test | Тест импорта одного сотрудника |
| POST | /api/legacy/import/employees/export-credentials | Импорт + CSV с паролями |

**API миграции данных:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/legacy/migration/status | Готовность + прогресс миграции |
| GET | /api/legacy/migration/preview | Превью (количества, маппинг) |
| POST | /api/legacy/migration/start | Запуск миграции (batchSize, maxRequests, dryRun) |
| POST | /api/legacy/migration/stop | Graceful остановка |
| GET | /api/legacy/migration/progress | Текущий прогресс (JSON) |
| POST | /api/legacy/migration/validate | Проверка целостности |
| GET | /api/legacy/migration/log | Записи migration log (status, limit, offset) |
| POST | /api/legacy/migration/retry-failed | Повтор ошибочных записей |
| POST | /api/legacy/migration/update-assignees | Ретроактивное обновление assignee (manager.id → User.id) |

**API синхронизации:**
| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/legacy/sync/status | Статус синхронизации |
| POST | /api/legacy/sync/enable | Включить cron-синхронизацию |
| POST | /api/legacy/sync/disable | Выключить cron-синхронизацию |
| POST | /api/legacy/sync/run-now | Запустить синхронизацию вручную |

**Frontend компоненты Legacy:**

UI-компоненты для выбора данных из Legacy CRM располагаются в `apps/frontend/src/components/legacy/`:

| Компонент | Описание |
|-----------|----------|
| `LegacyCustomerPicker` | Выбор клиента с поиском, показывает email/телефон, флаг "сотрудник" |
| `LegacyProductPicker` | Выбор товара с фильтром по категории, показывает цену и наличие |
| `LegacyCounterpartyPicker` | Выбор компании (контрагента), показывает ИНН |
| `LegacyDealLink` | Ссылка на сделку в Legacy CRM с загрузкой деталей |
| `LegacyDealsList` | Список ссылок на несколько сделок |

**Использование:**
```tsx
import {
  LegacyCustomerPicker,
  LegacyProductPicker,
  LegacyCounterpartyPicker,
  LegacyDealLink
} from '@/components/legacy';

// Выбор клиента
<LegacyCustomerPicker
  value={customerId}
  onChange={(customer) => setCustomerId(customer?.id ?? null)}
  placeholder="Выберите клиента"
  showLegacyLink
/>

// Выбор товара
<LegacyProductPicker
  value={productId}
  onChange={(product) => setProductId(product?.id ?? null)}
  inStockOnly
  showCategoryFilter
/>

// Ссылка на сделку
<LegacyDealLink dealId={12345} showDetails />
```

**API клиент:** `apps/frontend/src/lib/api/legacy.ts` — методы для всех Legacy эндпоинтов + генераторы URL (`legacyUrls.customer()`, `legacyUrls.deal()` и т.д.)

**Типы:** `apps/frontend/src/types/legacy.ts` — TypeScript интерфейсы для всех Legacy сущностей

**Frontend компоненты AI:**

UI-компоненты для AI функций располагаются в `apps/frontend/src/components/ai/`:

| Компонент | Описание |
|-----------|----------|
| `AiInsightsPanel` | Компактные AI подсказки в правом сайдбаре: похожие решения, эксперты, рекомендации. Автозагрузка при открытии заявки. |
| `AiClassificationPanel` | Панель AI классификации в карточке сущности (категория, приоритет, навыки, уверенность). Автообновляется через WebSocket при автоклассификации. |
| `AiSummaryBanner` | Компактный баннер AI-резюме переписки над таймлайном. Показывается при >= 5 комментариях, сворачиваемый. |
| `AiNotificationsPanel` | Панель проактивных AI уведомлений (кластеры, критические заявки). Показывает типизированные уведомления с иконками, dismiss/markRead/markAllRead, навигация к заявке. |
| `KnowledgeGraph` | SVG-визуализация графа знаний для заявки. Radial layout: центральная заявка → похожие legacy → эксперты → контрагенты → темы. Hover-эффекты, expand/collapse, клик на legacy открывает ссылку. |

**Использование:**
```tsx
import { AiClassificationPanel } from '@/components/ai';

// В карточке сущности
<AiClassificationPanel
  entityId={entity.id}
  title={entity.title}
  description={entity.data?.description}
  workspaceId={workspace?.id}
  readOnly={!canEdit}
  onApply={(classification) => console.log('Applied:', classification)}
/>
```

Панель показывает:
- Кнопку "Классифицировать с AI" если классификация не выполнена
- Результаты: категория, приоритет, требуемые навыки
- Процент уверенности с прогресс-баром
- Обоснование классификации
- Провайдер/модель AI
- Кнопки "Применить" и "Переклассифицировать"
- Автообновление через WebSocket событие `ai:classification:ready` при автоклассификации

**Автоклассификация при создании заявки:**
При создании новой entity, backend автоматически запускает AI классификацию в фоне (fire-and-forget). Результат отправляется через WebSocket `ai:classification:ready`. `AiClassificationPanel` подписывается на это событие через `CustomEvent` и автоматически отображает результат.

**AI Insights Panel (компактные подсказки):**
```tsx
import { AiInsightsPanel } from '@/components/ai/AiInsightsPanel';

<AiInsightsPanel
  entityId={entity.id}
  onShowDetails={() => setActiveTab('ai')}  // переключить на вкладку AI
/>
```

Панель показывает (в правом сайдбаре, 280px):
- До 2 текстовых рекомендаций (suggestedActions)
- До 3 похожих решённых случаев (с %, ссылкой на legacy)
- До 2 экспертов (с количеством релевантных случаев)
- Кнопку "Подробнее" для перехода на вкладку AI помощника

**In-memory кэш:** `AiAssistantService.getAssistance()` кэширует результаты на 5 мин (max 200 записей). Метод `invalidateCache(entityId)` для сброса.

| `AiUsageDashboard` | Дашборд статистики использования AI (запросы, токены, провайдеры, операции) |

**Использование AiUsageDashboard:**
```tsx
import { AiUsageDashboard } from '@/components/ai';

// В админке или настройках
<AiUsageDashboard defaultDays={30} />
```

Дашборд показывает:
- Общую статистику: запросы, токены (вх/вых), среднее время ответа, успешность
- Распределение по провайдерам (OpenAI, Ollama, Groq)
- Распределение по операциям (классификация, генерация, поиск)
- График использования по дням
- Таблицу последних запросов с деталями

**API клиент:** `apps/frontend/src/lib/api/ai.ts` — методы для всех AI эндпоинтов

**Типы:** `apps/frontend/src/types/ai.ts` — TypeScript интерфейсы для AI модуля

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

3. **Internal workspaces** - скрыты от UI, доступны только программно:
   - Workspace с `isInternal: true` не возвращается через `findAll()` / `getAccessibleWorkspaces()`
   - Исключён из глобального поиска (SearchService)
   - Не отображается в sidebar, dashboard, аналитике
   - Используется для хранения данных AI/RAG (например, Legacy CRM с prefix `LEG`)
   - AI-сервисы (KnowledgeBaseService, RagIndexerService) работают напрямую через pgvector, не зависят от workspace visibility

4. **Экспорт JSON** - полный бэкап workspace:
   - Включает workspace с настройками секций/полей
   - Включает все сущности с полями
   - Добавляет timestamp экспорта

4. **Экспорт CSV** - табличный экспорт сущностей:
   - Формат с BOM для корректного отображения в Excel
   - Колонки: ID, Номер, Название, Статус, Приоритет, Исполнитель, Дата создания

**GeocodingModule**
Геокодирование через Yandex Geocoder API.

```
geocoding/
├── geocoding.module.ts
├── geocoding.controller.ts    # search, reverse
├── geocoding.service.ts       # geocode, reverseGeocode
├── geocoding.service.spec.ts
└── geocoding.controller.spec.ts
```

- `geocode(address)` — прямое геокодирование (адрес -> координаты), возвращает массив `GeocodingResult[]`
- `reverseGeocode(lat, lng)` — обратное геокодирование (координаты -> адрес), возвращает `GeocodingResult | null`
- In-memory кеш с TTL 5 минут и максимальным размером 1000 записей
- Graceful degradation: если `YANDEX_GEOCODER_API_KEY` не задан, возвращает пустые результаты
- Таймаут HTTP-запросов: 5 секунд

**KnowledgeBaseModule**
База знаний для сотрудников — загрузка документов (PDF/DOCX/TXT) и создание FAQ статей с автоматической индексацией в RAG для улучшения AI-подсказок.

```
knowledge-base/
├── knowledge-base.module.ts
├── knowledge-base.controller.ts       # REST API (8 endpoints)
├── knowledge-base.controller.spec.ts  # unit-тесты контроллера
├── entities/
│   └── knowledge-article.entity.ts    # TypeORM entity (type: 'document' | 'faq')
├── dto/
│   └── knowledge-base.dto.ts          # CreateFaqDto, UpdateArticleDto, ArticleFilterDto
└── services/
    ├── knowledge-article.service.ts      # CRUD, права, фильтрация, RAG-индексация
    ├── knowledge-article.service.spec.ts # unit-тесты сервиса
    ├── document-parser.service.ts        # PDF/DOCX/TXT парсинг (pdf-parse, mammoth)
    └── document-parser.service.spec.ts   # unit-тесты парсера
```

Ключевые особенности:
- Загрузка документов в S3 через `S3Service.uploadFileWithThumbnail()`
- Асинхронная индексация через `setImmediate()` — не блокирует HTTP response
- Используется `KnowledgeBaseService.addChunk()` из AiModule для RAG
- Graceful degradation: если AI недоступен, статья создаётся без индексации
- Права: все сотрудники создают, удалять — автор или ADMIN
- Chunking: 512 токенов, 50 overlap, sentence boundary detection
- Фронтенд: страница `/knowledge-base`, табы Документы/FAQ/Статистика

**ChatModule**
Корпоративный мессенджер в стиле Telegram — личные, групповые чаты и обсуждения заявок.

```
chat/
├── chat.module.ts
├── chat.service.ts               # бизнес-логика (CRUD, дедупликация, cursor-пагинация, реакции, pin)
├── chat.service.spec.ts          # 27 unit-тестов
├── chat.controller.ts            # REST API (17 endpoints)
├── dto/
│   ├── create-conversation.dto.ts
│   ├── send-message.dto.ts
│   ├── edit-message.dto.ts
│   ├── mark-read.dto.ts
│   ├── add-participants.dto.ts
│   └── messages-query.dto.ts
└── entities/
    ├── conversation.entity.ts           # conversations (direct, group, entity)
    ├── conversation-participant.entity.ts # conversation_participants
    ├── message.entity.ts                # messages (text, voice, system)
    ├── message-reaction.entity.ts       # message_reactions (emoji toggle)
    └── pinned-message.entity.ts         # pinned_messages (pin/unpin)
```

**Ключевые возможности:**
- Три типа чатов: `direct` (1-на-1), `group`, `entity` (привязан к заявке)
- Дедупликация: один direct чат между двумя пользователями, один чат на заявку
- Cursor-based пагинация сообщений
- Soft delete сообщений, редактирование своих
- Read receipts (lastReadAt, lastReadMessageId)
- Full-text search по сообщениям (tsvector, русский язык)
- Голосовые сообщения (voiceKey → S3, voiceDuration, voiceWaveform)
- Вложения: файлы, изображения с drag-and-drop, paste, превью
- Emoji-реакции (toggle per user, агрегация по emoji)
- Закреплённые сообщения (pin/unpin, banner в ChatView)
- System messages (add/remove participants)
- WebSocket: real-time доставка, typing indicators, room-based routing
- Desktop notifications + звуковые уведомления (Web Audio API)
- Link previews (OG meta-теги через `/api/og-preview`)

**Frontend компоненты:**
- `ChatPage` — два столбца: ConversationList (380px) + ChatView
- `ConversationList` / `ConversationItem` — список чатов с бейджами непрочитанных
- `ChatView` / `ChatHeader` — просмотр чата, статус онлайн/печатает, pinned banner
- `MessageList` — бесконечный скролл, автопрокрутка, DateSeparator, id на сообщениях для scroll-to
- `MessageBubble` — Telegram-стиль: цветные bubble, SVG хвостик, время + чекмарки, контекстное меню, emoji-реакции, link preview, image preview с lightbox
- `ChatInput` — textarea с Enter=send, Shift+Enter=newline, reply preview, файлы (drag-and-drop, paste), голос (MediaRecorder)
- `VoicePlayer` — визуализация waveform, play/pause, скорость 1x/1.5x/2x
- `ChatSearchPanel` — поиск по сообщениям с debounce, навигация по результатам, scroll-to + highlight
- `ChatMenu` — список участников, добавление/удаление, выход из чата
- `NewChatModal` — выбор пользователей для личного/группового чата

**Frontend store:** `useChatStore` (Zustand) — conversations, messages, unreadCounts, typingUsers, replyToMessage, pinnedMessages + WS handlers (onReactionUpdated, onMessagePinned/Unpinned)

#### API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/entities | Список сущностей (query: workspaceId) — legacy, без пагинации |
| GET | /api/entities/kanban | Канбан с серверной пагинацией (query: workspaceId, perColumn, search, assigneeId[], priority[], dateFrom, dateTo, customFilters) |
| GET | /api/entities/kanban/column | Подгрузка колонки (query: workspaceId, status, offset, limit + фильтры + customFilters) |
| GET | /api/entities/table | Табличное представление с пагинацией (query: workspaceId, page, perPage, sortBy, sortOrder, search, assigneeId[], priority[], status[], dateFrom, dateTo, customFilters) |
| GET | /api/entities/facets | Фасетные агрегации (query: workspaceId, search, assigneeId[], priority[], dateFrom, dateTo, customFilters) — счётчики значений для фильтров |
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
| POST | /api/bpmn/definitions/:id/deploy | Развернуть процесс в Zeebe (body: { changelog? }) |
| GET | /api/bpmn/definition/:id/versions | История версий процесса |
| GET | /api/bpmn/definition/:id/versions/:version | Конкретная версия с BPMN XML |
| POST | /api/bpmn/definition/:id/rollback/:version | Откатить на указанную версию |
| GET | /api/bpmn/instances/workspace/:workspaceId | Экземпляры процессов workspace |
| GET | /api/bpmn/instances/entity/:entityId | Экземпляры процессов для сущности |
| GET | /api/bpmn/instances/:instanceId/timeline | Унифицированный timeline экземпляра (activity logs + user tasks + lifecycle) |
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
| GET | /api/bpmn/tasks/inbox | Задачи пользователя (inbox) с пагинацией (page, perPage, sortBy, sortOrder) |
| GET | /api/bpmn/tasks | Поиск/фильтрация задач с пагинацией |
| GET | /api/bpmn/tasks/statistics?workspaceId=:id | Статистика по задачам |
| GET | /api/bpmn/tasks/:id | Детали задачи с формой |
| GET | /api/bpmn/tasks/:id/comments | Комментарии задачи |
| POST | /api/bpmn/tasks/:id/claim | Взять задачу |
| POST | /api/bpmn/tasks/:id/unclaim | Отпустить задачу |
| POST | /api/bpmn/tasks/:id/complete | Завершить задачу с данными формы |
| POST | /api/bpmn/tasks/:id/delegate | Делегировать задачу |
| POST | /api/bpmn/tasks/batch/claim | Массовый claim задач ({ taskIds: string[] }) |
| POST | /api/bpmn/tasks/batch/delegate | Массовое делегирование ({ taskIds, targetUserId }) |
| POST | /api/bpmn/tasks/:id/comments | Добавить комментарий к задаче |
| GET | /api/bpmn/forms?workspaceId=:id | Список определений форм |
| GET | /api/bpmn/forms/:id | Детали определения формы |
| POST | /api/bpmn/forms | Создать определение формы |
| PUT | /api/bpmn/forms/:id | Обновить определение формы |
| DELETE | /api/bpmn/forms/:id | Удалить определение формы |
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
| GET | /api/bpmn/incidents?workspaceId=:id | Список инцидентов (зависших процессов) |
| GET | /api/bpmn/incidents/count?workspaceId=:id | Количество инцидентов (для badge) |
| POST | /api/bpmn/incidents/:id/retry | Повторить инцидент (сброс статуса на active) |
| POST | /api/bpmn/incidents/:id/cancel | Отменить инцидент (terminate process) |
| GET | /api/bpmn/mining/definitions/:id/stats | Process Mining статистика процесса |
| GET | /api/bpmn/mining/definitions/:id/time-analysis | Анализ времени (дни недели, часы) |
| GET | /api/bpmn/mining/definitions/:id/element-stats | Per-element статистика для heat map |
| GET | /api/bpmn/mining/workspaces/:workspaceId/stats | Статистика всех процессов workspace |
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
| GET | /api/geocoding/search?q=адрес | Прямое геокодирование (адрес → координаты) |
| GET | /api/geocoding/reverse?lat=55.75&lng=37.61 | Обратное геокодирование (координаты → адрес) |

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

Process Mining модуль предоставляет статистическую аналитику выполнения бизнес-процессов. Работает на базе данных из ProcessInstance и ProcessActivityLog без внешних зависимостей (Camunda Optimize не используется).

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

**ElementStats (per-element статистика для heat map)**
```typescript
interface ElementStats {
  elements: {
    elementId: string;           // BPMN element ID
    elementType: string;         // serviceTask, userTask, etc.
    executionCount: number;      // Количество выполнений
    successCount: number;        // Успешных
    failedCount: number;         // С ошибкой
    avgDurationMs: number | null; // Среднее время (мс)
    minDurationMs: number | null;
    maxDurationMs: number | null;
  }[];
}
```

> Данные агрегируются из двух источников: `process_activity_logs` (service tasks, записываемые workers) и `user_tasks` (user tasks).

### Применение

- Per-element heat map: визуализация загрузки каждого элемента BPMN процесса
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

## AI / RAG (Retrieval-Augmented Generation)

### Описание

AI модуль обеспечивает интеллектуальную помощь на основе исторических данных из Legacy CRM. Использует RAG (Retrieval-Augmented Generation) для поиска похожих случаев и генерации ответов.

### Структура модуля

```
modules/ai/
├── ai.module.ts                     # NestJS модуль
├── ai.controller.ts                 # REST API (поиск, классификация, индексация)
├── dto/ai.dto.ts                    # DTO для запросов и ответов
├── entities/
│   ├── knowledge-chunk.entity.ts    # Чанки знаний с embeddings (pgvector)
│   ├── ai-usage-log.entity.ts       # Логи использования AI
│   ├── ai-classification.entity.ts  # Результаты классификации
│   └── ai-notification.entity.ts    # Проактивные AI уведомления
├── providers/
│   ├── base-llm.provider.ts         # Базовый интерфейс провайдера
│   ├── ollama.provider.ts           # Ollama (локальные модели, бесплатно)
│   ├── groq.provider.ts             # Groq API (облачный, бесплатный tier)
│   ├── openai.provider.ts           # OpenAI API (облачный, платно)
│   └── ai-provider.registry.ts      # Реестр провайдеров с fallback
└── services/
    ├── classifier.service.ts        # Классификация заявок
    ├── knowledge-base.service.ts    # Работа с векторной БД
    ├── rag-indexer.service.ts       # Индексация legacy данных
    ├── ai-assistant.service.ts      # AI помощник (похожие случаи, эксперты)
    ├── ai-notification.service.ts   # Проактивные уведомления (кластеры, критические)
    └── knowledge-graph.service.ts   # Граф знаний (связи entity ↔ legacy ↔ эксперты)
```

### Провайдеры AI

Система поддерживает несколько AI провайдеров с автоматическим fallback:

| Провайдер | Тип | Embeddings | LLM | Стоимость |
|-----------|-----|------------|-----|-----------|
| **Ollama** | Локальный | ✅ nomic-embed-text | ✅ qwen2.5, llama3.1 | Бесплатно |
| **Groq** | Облачный | ❌ | ✅ llama-3.1-70b | Бесплатно (14K req/day) |
| **OpenAI** | Облачный | ✅ text-embedding-3-large | ✅ gpt-4o | Платно |

**Приоритеты провайдеров (настраиваются в .env):**
```env
AI_LLM_PRIORITY=groq,ollama,openai       # Для генерации текста
AI_EMBEDDING_PRIORITY=ollama,openai      # Для embeddings
```

**Запуск Ollama локально:**
```bash
./scripts/setup-ollama.sh
# или
docker compose -f docker-compose.ollama.yml up -d
docker compose -f docker-compose.ollama.yml exec ollama ollama pull nomic-embed-text
docker compose -f docker-compose.ollama.yml exec ollama ollama pull qwen2.5:14b
```

### Knowledge Base (Векторная база знаний)

**Технологии:**
- **pgvector** - расширение PostgreSQL для векторного поиска
- **text-embedding-3-large** - OpenAI модель для embeddings (1536 измерений)
- **Cosine similarity** - метрика схожести

**Схема таблицы knowledge_chunks:**
```sql
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  source_type VARCHAR(50),  -- 'legacy_request', 'entity', 'document'
  source_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP
);

-- Индекс для быстрого поиска
CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);
```

### RAG Indexer

Индексирует данные из Legacy CRM (заявки QD_requests и ответы QD_answers).

**Параметры чанкинга:**
- Размер чанка: ~512 токенов (~2000 символов)
- Overlap: 50 токенов между чанками
- Минимальная длина: 50 символов

**Metadata в чанках:**
```typescript
{
  // Базовая информация
  requestId: number,
  subject: string,
  legacyUrl: string,  // https://www.stankoff.ru/crm/request/{id}

  // Информация о сотрудниках (для рекомендаций экспертов)
  managerName: string,
  managerDepartment: string,
  specialists: Array<{ id: number, name: string }>,
  specialistNames: string[],

  // Информация о клиенте
  customerName: string,
  customerEmail: string,
  customerIsEmployee: boolean,
  customerTotalRequests: number,

  // Контрагент и сделки
  counterpartyId: number,
  counterpartyName: string,
  counterpartyInn: string,
  counterpartyUrl: string,
  relatedDeals: Array<{
    id: number,
    name: string,
    sum: number,
    url: string
  }>,

  // Аналитика заявки
  priority: string,
  requestType: string,
  resolutionTimeHours: number,
  resolutionTimeDays: number,
  firstResponseTimeHours: number,
  responseCount: number,
  internalResponseCount: number
}
```

### API эндпоинты

**Поиск:**
- `POST /api/ai/search` - RAG поиск по базе знаний
  - Возвращает похожие случаи с legacy ссылками
  - Рекомендует экспертов на основе истории решений
  - Генерирует ответ на основе найденного контекста

**Классификация:**
- `POST /api/ai/classify` - Автоматическая классификация заявки
  - Определяет категорию, приоритет, требуемые навыки
  - Предлагает исполнителя

**Индексация:**
- `GET /api/ai/indexer/health` - Статус индексера
- `GET /api/ai/indexer/status` - Текущий статус индексации
- `GET /api/ai/indexer/stats` - Статистика (legacy/KB/coverage)
- `POST /api/ai/indexer/start` - Запуск полной индексации
- `POST /api/ai/indexer/reindex/:requestId` - Переиндексация одной заявки

**AI Помощник:**
- `GET /api/ai/assist/:entityId` - Получить AI помощь для заявки
  - Похожие решённые случаи с ссылками на legacy
  - Рекомендуемые эксперты на основе истории
  - Связанный контекст (контрагенты, сделки, средний срок решения, топ-категории)
  - Рекомендуемые действия
- `POST /api/ai/assist/:entityId/suggest-response` - Сгенерировать черновик ответа
  - Использует RAG для поиска похожих решённых случаев
  - Генерирует черновик ответа на русском языке
  - Возвращает источники с процентом схожести
  - Черновик можно вставить прямо в редактор комментария через кнопку AI в тулбаре
- `POST /api/ai/assist/:entityId/suggest-response/stream` - Streaming генерация ответа (SSE)
  - Server-Sent Events: `data: {"type":"chunk","text":"..."}` и `data: {"type":"done","sources":[...]}`
  - Текст появляется у пользователя по мере генерации (нет ожидания 3-5 сек)
  - Заголовки: `Content-Type: text/event-stream`, `X-Accel-Buffering: no`
- `GET /api/ai/assist/:entityId/summary` - AI-резюме переписки
  - Кэш 5 мин, summary для >= 3 комментариев
  - Возвращает: `{ summary: string, commentCount: number }`
- **Sentiment** — встроен в `GET /api/ai/assist/:entityId` (поле `sentiment`)
  - Анализ настроения последнего комментария
  - Возвращает: `{ label, emoji, score }` (satisfied/neutral/concerned/frustrated/urgent)

**Статистика использования:**
- `GET /api/ai/usage/stats` - Статистика использования AI
  - Параметры: days (1-365), provider, operation
  - Возвращает: общее количество запросов/токенов, статистику по провайдерам/операциям/дням
- `GET /api/ai/usage/logs` - Последние логи запросов
  - Параметры: limit (1-200), provider, operation
  - Возвращает: массив записей с деталями каждого запроса

**Проактивные AI уведомления:**
- `GET /api/ai/notifications` - Список уведомлений с пагинацией
  - Параметры: workspaceId, unreadOnly, limit, offset
  - Возвращает: `{ notifications: AiNotificationItem[], total: number }`
- `GET /api/ai/notifications/unread-count` - Количество непрочитанных
  - Параметры: workspaceId (опционально)
  - Возвращает: `{ count: number }`
- `PATCH /api/ai/notifications/:id/read` - Отметить прочитанным
- `POST /api/ai/notifications/mark-all-read` - Отметить все прочитанными
  - Body: `{ workspaceId? }`
- `DELETE /api/ai/notifications/:id` - Скрыть (dismiss) уведомление
- `POST /api/ai/notifications/toggle` - Включить/выключить проактивный анализ
  - Body: `{ enabled: boolean }`

**Типы уведомлений:**
| Тип | Описание |
|-----|----------|
| `cluster_detected` | Кластер похожих заявок (3+ с одинаковыми ключевыми словами за 1 час) |
| `critical_entity` | Критическая заявка (авария, срочно, остановка, простой и т.д.) |
| `sla_risk` | Риск нарушения SLA |
| `duplicate_suspected` | Подозрение на дублирование |
| `trend_anomaly` | Аномалия в тренде заявок |

**Граф знаний (контекстное обогащение):**
- `GET /api/ai/knowledge-graph/:entityId` - Построить граф связей для заявки
  - Возвращает: `{ nodes: GraphNode[], edges: GraphEdge[], centerNodeId: string }`
  - Узлы: entity, legacy_request, expert, counterparty, topic
  - Рёбра: similar_to (вес = similarity), assigned_to, related_to, belongs_to
  - Graceful degradation: если AI недоступен, возвращает только центральный узел + assignee

### Результат поиска

```typescript
interface SearchResultDto {
  results: SearchResultItem[];   // Похожие чанки
  generatedAnswer?: string;      // Сгенерированный ответ
  relatedLinks?: Array<{         // Ссылки на legacy
    label: string;
    url: string;
    sourceType: string;
  }>;
  suggestedExperts?: Array<{     // Рекомендуемые эксперты
    name: string;
    managerId?: number;
    department?: string;
    relevantCases: number;
    topics: string[];
  }>;
}
```

### Конфигурация

```env
# Приоритеты провайдеров
AI_LLM_PRIORITY=groq,ollama,openai
AI_EMBEDDING_PRIORITY=ollama,openai
AI_EMBEDDING_DIMENSION=1536

# Ollama (локально, бесплатно)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Groq (облако, бесплатный tier - 14,400 req/day)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-70b-versatile

# OpenAI (облако, платно - fallback)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```

### Проактивные уведомления (Cron)

`AiNotificationService` автоматически анализирует новые заявки каждые 5 минут (`@Cron(EVERY_5_MINUTES)`):

1. **Обнаружение кластеров** — группирует заявки по workspace, извлекает ключевые слова (первые 3 слова длиной >= 4 символов), если 3+ заявок с одинаковыми ключевыми словами за последний час → уведомление `cluster_detected`
2. **Критические заявки** — проверяет наличие ключевых слов (авария, срочно, не работает, остановка, простой, критично) в title/description → уведомление `critical_entity`

In-memory `notifiedEntities` Set (max 5000) предотвращает дублирование уведомлений. WebSocket `ai:notification` доставляет уведомления в реальном времени.

### Граф знаний

`KnowledgeGraphService.buildGraph(entityId)` строит контекстный граф:

1. Загружает entity с assignee и workspace
2. Ищет похожие случаи через RAG (`KnowledgeBaseService.searchSimilar`)
3. Формирует узлы и рёбра:
   - **entity** — центральный узел (заявка)
   - **legacy_request** — похожие legacy заявки (с URL, similarity)
   - **expert** — эксперты (assignee + менеджеры из legacy)
   - **counterparty** — контрагенты из legacy результатов
   - **topic** — ключевые слова из описания заявки

Frontend: SVG-визуализация с radial layout в `KnowledgeGraph.tsx`.

### Планы на будущее

**Индексация документов (TODO):**
- Договоры и соглашения из legacy
- PDF/DOC файлы из вложений заявок
- Техническая документация
- База знаний FAQ
- Инструкции и регламенты
- Презентации и обучающие материалы

## Система онбординга

### Описание

Система онбординга обеспечивает интерактивное обучение новых сотрудников и повышение квалификации. Поддерживает туры с подсказками, квизы и персонализированное обучение.

### Структура модуля (Backend)

```
modules/onboarding/
├── onboarding.module.ts
├── onboarding.controller.ts
├── onboarding.service.ts
├── entities/
│   ├── onboarding-tour.entity.ts      # Туры обучения
│   ├── onboarding-step.entity.ts      # Шаги туров
│   ├── onboarding-progress.entity.ts  # Прогресс пользователя
│   └── onboarding-quiz.entity.ts      # Квизы/тесты
└── dto/onboarding.dto.ts
```

### Типы туров и шагов

**Аудитория тура:**
- `all` - Все пользователи
- `new_users` - Только новые пользователи
- `role_based` - По ролям (admin, manager, user)
- `department` - По отделам

**Типы шагов:**
- `tooltip` - Подсказка с указателем на элемент
- `modal` - Модальное окно
- `highlight` - Подсветка элемента
- `video` - Видео-инструкция
- `quiz` - Тест/квиз
- `action` - Требует действия от пользователя

### API эндпоинты

**Пользовательские:**
- `GET /api/onboarding/status` - Статус онбординга пользователя
- `GET /api/onboarding/auto-start` - Туры для автозапуска
- `GET /api/onboarding/tours/code/:code` - Тур по коду
- `POST /api/onboarding/tours/:tourId/start` - Начать тур
- `POST /api/onboarding/tours/:tourId/complete-step` - Завершить шаг
- `POST /api/onboarding/tours/:tourId/skip` - Пропустить тур
- `POST /api/onboarding/tours/:tourId/submit-quiz` - Отправить ответы квиза
- `GET /api/onboarding/quizzes/:id` - Получить квиз

**Административные (admin):**
- `GET /api/onboarding/admin/tours` - Список всех туров
- `POST /api/onboarding/admin/tours` - Создать тур
- `PUT /api/onboarding/admin/tours/:id` - Обновить тур
- `DELETE /api/onboarding/admin/tours/:id` - Удалить тур
- `POST /api/onboarding/admin/steps` - Создать шаг
- `PUT /api/onboarding/admin/steps/:id` - Обновить шаг
- `DELETE /api/onboarding/admin/steps/:id` - Удалить шаг

### Компоненты (Frontend)

**Onboarding:**
- `OnboardingProvider.tsx` - Провайдер для автозапуска туров
- `OnboardingTooltip.tsx` - Tooltip с подсветкой элемента
- `OnboardingStatusCard.tsx` - Карточка прогресса на Dashboard

### Store

```typescript
interface OnboardingStore {
  status: UserOnboardingStatus | null;
  activeTour: OnboardingTour | null;
  currentStep: OnboardingStep | null;
  isVisible: boolean;

  loadStatus(): Promise<void>;
  checkAutoStart(): Promise<void>;
  startTour(tourId: string): Promise<void>;
  nextStep(): Promise<void>;
  skipStep(): Promise<void>;
  skipTour(): Promise<void>;
}
```

### Планы на будущее (Онбординг)

- AI-наставник для ответов на вопросы по работе платформы
- Рекомендации обучающих материалов на основе типичных ошибок
- Интеграция с базой знаний для повышения квалификации

**Улучшения RAG:**
- Автоматическая переиндексация при обновлении заявок
- Кэширование embeddings
- Batch processing для ускорения индексации
- Fine-tuning модели на доменных данных
- Мультимодальный поиск (текст + изображения)

## Сервисный отдел (Service Department)

### Организационная структура

```
Козлов А. (Директор по сервису)
├── Волкова Е. (Руководитель L1)
│   ├── Орлов Д. (Инженер L1)
│   ├── Морозова А. (Инженер L1)
│   └── Новиков С. (Инженер L1)
├── Белов И. (Руководитель L2)
│   ├── Соколова О. (Инженер L2, оборудование)
│   └── Лебедев М. (Инженер L2, ПО)
└── Кузнецова Н. (Руководитель рекламаций)
    ├── Попов П. (Специалист)
    └── Смирнова Т. (Специалист)
```

### Workspace «Техническая поддержка» (TP)

**Статусы (ITIL):** new → classified → assigned → in_progress → waiting_client / waiting_vendor → resolved → closed / reopened

**Категории:** hardware, software, network, access, other

**Приоритеты:** low, medium, high, critical

**User Groups:** l1-support, l2-hardware, l2-software, management

### Workspace «Рекламации» (REK)

**Статусы (ISO 10002):** received → registered → investigation → root_cause_analysis → decision → corrective_actions → client_notification → closed / rejected

**Типы:** quality, delivery, service, billing

**Серьёзность:** minor, major, critical

### BPMN процессы

**service-support-v2** — Полный цикл техподдержки:
- AI-классификация (classify-entity worker)
- Маршрутизация через DMN
- L1/L2 эскалация
- Ожидание клиента (48ч таймер → автозакрытие)
- Переквалификация в рекламацию (create-entity)
- Цикл подтверждения (переоткрытие)

**claims-management** — Управление рекламациями (ISO 10002):
- Валидация и регистрация
- Расследование + Root Cause Analysis
- Эскалация при критической серьёзности
- Корректирующие действия
- Email-уведомление клиента

**sla-escalation** — Автоэскалация по SLA:
- Warning (80%) → уведомление исполнителя
- Breach (100%) → уведомление руководителя
- Critical (150%) → уведомление директора

### SLA определения

| Приоритет | Время ответа | Время решения |
|-----------|-------------|---------------|
| Critical  | 15 мин      | 4 часа        |
| High      | 1 час       | 8 часов       |
| Medium    | 4 часа      | 24 часа       |
| Low       | 8 часов     | 72 часа       |

### DMN таблицы

- **Маршрутизация техподдержки** — определяет L1/L2 и группу по приоритету и категории
- **Оценка серьёзности рекламации** — определяет серьёзность и автоэскалацию по типу и сумме

### Seed система (модульная)

Seed данные основаны на **реальных сотрудниках** из legacy CRM (87 человек из 14 отделов).

**Структура:** `apps/backend/src/seed/`

```
seed/
├── seed.module.ts                # NestJS модуль (17 entities, forwardRef: AuthModule, BpmnModule)
├── seed-orchestrator.service.ts  # Главный оркестратор (OnModuleInit)
├── seed-cleanup.service.ts       # Полная очистка ВСЕХ данных (FK-safe порядок)
├── seed-users.service.ts         # 87 пользователей из legacy + Коршунов
├── seed-keycloak.service.ts      # Регистрация в Keycloak (graceful degradation)
├── seed-structure.service.ts     # 8 секций + 15 workspaces + members
├── seed-entities.service.ts      # ~102 entities + ~280 comments (14 workspaces)
├── seed-it-department.service.ts # IT workspace: 25 задач разработки с диалогами
├── seed-bpmn.service.ts          # 10 BPMN definitions + deploy + triggers + instances
├── seed-sla-dmn.service.ts       # 6 SLA definitions + 3 DMN tables
└── data/
    ├── employees.ts              # 87 сотрудников (hardcoded из legacy)
    └── departments.ts            # 14 отделов + 8 секций
```

**Порядок выполнения (seed-orchestrator):**
1. Проверка маркера (Section 'Продажи' → skip)
2. Ожидание Zeebe (`bpmnService.waitForConnection`)
3. Cleanup — удаление ВСЕХ данных (включая Legacy)
4. Создание 87 пользователей (seed-users)
5. Регистрация в Keycloak (seed-keycloak, опционально)
6. 8 секций + 15 workspaces + members (seed-structure)
7. ~102 entities + ~280 comments (seed-entities)
8. IT workspace: 25 задач + ~150 комментариев (seed-it-department)
9. BPMN: 10 definitions → deploy → triggers → instances (seed-bpmn)
10. SLA/DMN: 6 SLA + 3 DMN (seed-sla-dmn)

**Данные сотрудников (87 человек):**
- 86 из legacy `manager` + `SS_customers` (реальные email, имена, отделы)
- +1 Коршунов С.М. (добавлен вручную, korshunovsm@yandex.ru)
- Роли: 3 admin, ~14 manager, ~70 employee
- Особые пользователи: youredik@gmail.com (admin, IT), korshunovsm@yandex.ru (admin, IT)

**Секции и workspaces (8 секций, 15 workspaces):**

| Секция | Workspaces | Prefixes |
|--------|-----------|----------|
| Продажи | Заявки клиентов, Коммерческие предложения | ZK, KP |
| Сервис | Сервисные заявки, Рекламации | SZ, REK |
| Маркетинг | Маркетинговые задачи, Контент-план | MK, KN |
| Склад и логистика | Складские операции, Доставки | SK, DV |
| Финансы | Финансовые документы, Согласование расходов | FD, SR |
| Юридический и ВЭД | Договоры, ВЭД операции | DG, VED |
| Управление | HR и кадры, Тендеры | HR, TN |
| IT | Разработка Stankoff Portal | DEV |

**IT workspace (отдельный сервис):**
- 25 задач разработки Stankoff Portal (DEV-1..DEV-25)
- Задачи в разных статусах: 12 completed, 5 in development, 2 code review, 2 testing, 4 backlog
- Реалистичные диалоги между Коршуновым (PM) и youredik (dev)
- Тематика: NestJS, Keycloak, CRUD, Kanban, BPMN, Legacy миграция, AI, SLA, DMN

**Keycloak интеграция:**
- Graceful degradation: если `isConfigured()` → false, seed продолжает без Keycloak
- Удаляет всех существующих пользователей (кроме admin) перед созданием
- Временные пароли + `requiredActions: ['UPDATE_PASSWORD']`

## E2E тестирование BPMN (Playwright)

### Структура

```
apps/frontend/e2e/
├── helpers/
│   ├── test-utils.ts              # Общие хелперы (~60 функций: BPMN + Chat + AI API)
│   └── selectors.ts              # Централизованные data-testid селекторы
├── scenarios/                     # Полные workflow через реальный Zeebe
│   ├── support-ticket.spec.ts
│   ├── claims-management.spec.ts
│   ├── incident-reopen.spec.ts
│   ├── multi-level-approval.spec.ts
│   └── smart-routing.spec.ts
├── bpmn-user-tasks.spec.ts        # User task операции (18 тестов)
├── bpmn-processes.spec.ts         # Process management + versioning (15 тестов)
├── bpmn-mining.spec.ts            # Process Mining API (10 тестов)
├── bpmn-triggers.spec.ts          # Реальные триггеры + webhook (17 тестов)
├── bpmn-incidents.spec.ts         # Реальные инциденты через Zeebe (10 тестов)
├── bpmn-forms.spec.ts             # CRUD определений форм (4 теста)
├── bpmn-entity-links.spec.ts      # CRUD связей сущностей (4 теста)
├── bpmn-lifecycle.spec.ts         # UI навигация по BPMN страницам
├── ai-assistant.spec.ts           # AI-помощник + резюме (22 теста)
└── chat.spec.ts                   # Корпоративный чат (75 тестов)
```

### Покрытие BPMN функционала

| Область | Покрытие | Тесты |
|---------|----------|-------|
| User Tasks API (claim/unclaim/delegate/complete/batch/comments/inbox/statistics) | 100% | 18 |
| Process Definitions (CRUD/deploy/versions/rollback/delete) | 100% | 15 |
| Process Instances (start/cancel/timeline) | 100% | включены в processes |
| Triggers (entity_created/status_changed/comment_added/webhook/conditions) | 90% | 17 |
| Incidents (real Zeebe incidents: list/count/retry/cancel) | 100% | 10 |
| Process Mining (stats/time-analysis/element-stats/workspace) | 100% | 10 |
| Forms (CRUD) | 100% | 4 |
| Entity Links (CRUD + spawn) | 100% | 4 |
| Scenario Workflows (полные бизнес-процессы) | 100% | 5 сценариев |

### Хелперы (test-utils.ts)

Все BPMN хелперы используют dev-auth (`POST /auth/dev/login`) и возвращают `null` при ошибке:

- **User Tasks:** `getInboxApi`, `claimTaskApi`, `unclaimTaskApi`, `completeTaskApi`, `delegateTaskApi`, `batchClaimApi`, `batchDelegateApi`, `addTaskCommentApi`, `getTaskCommentsApi`, `getTaskStatisticsApi`, `getTaskDetailApi`
- **Processes:** `cancelProcessApi`, `getProcessTimelineApi`, `getProcessVersionsApi`, `deleteDefinitionApi`, `getDefinitionStatsApi`, `getWorkspaceBpmnStatsApi`
- **Mining:** `getMiningStatsApi`, `getMiningTimeAnalysisApi`, `getMiningElementStatsApi`, `getMiningWorkspaceStatsApi`
- **Incidents:** `getIncidentsApi`, `getIncidentCountApi`, `retryIncidentApi`, `cancelIncidentApi`, `waitForIncident`
- **Triggers:** `getTriggerExecutionsApi`, `getRecentExecutionsApi`, `sendWebhookApi`, `updateEntityStatusApi`, `addCommentToEntityApi`

## E2E тестирование AI-помощника (Playwright)

### Структура

```
apps/frontend/e2e/
├── ai-assistant.spec.ts          # AI-помощник + резюме (22 теста)
```

### Покрытие AI-помощника

| Область | Покрытие | Тесты |
|---------|----------|-------|
| API: AI Assistant (assist/suggest-response/summary) | 100% | 4 |
| UI: Вкладка AI-помощника (переключение, генерация, черновик, копирование) | 100% | 6 |
| UI: Похожие случаи (карточки, ID/%, ссылка на legacy CRM) | 100% | 3 |
| UI: Рекомендуемые эксперты (карточки, имя/отдел/кейсы) | 100% | 2 |
| UI: Рекомендации, теги, контекст | 100% | 3 |
| UI: AI Резюме переписки (баннер, toggle, содержимое) | 100% | 4 |
| Edge cases (AI недоступен, нет описания) | 100% | 2 |

### Хелперы AI (test-utils.ts)

- `getAiAssistanceApi(entityId)` — получить AI подсказки
- `generateAiResponseApi(entityId, context?)` — сгенерировать черновик ответа
- `getAiSummaryApi(entityId)` — AI резюме переписки
- `seedCommentsForEntity(entityId, count)` — засеять N тестовых комментариев

### Селекторы (selectors.ts)

- `aiAssistant` — 20 селекторов (tab, generateBtn, streamingDraft, generatedDraft, draftText, copyBtn, insertBtn, draftSources, actionsSection, actionItem, similarCasesSection, similarCase, expertsSection, expertCard, relatedContext, keywordsSection, keywordTag, loading, unavailable, noData)
- `aiSummary` — 4 селектора (banner, toggle, text, loading)

## E2E тестирование корпоративного чата (Playwright)

### Структура

```
apps/frontend/e2e/
├── chat.spec.ts                  # Корпоративный чат (75 тестов)
```

### Покрытие Chat-функционала

| Область | Покрытие | Тесты |
|---------|----------|-------|
| API: Чаты (создание/список/детали/поиск) | 100% | 4 |
| API: Сообщения (отправка/получение/редактирование/удаление/reply) | 100% | 5 |
| API: Реакции (добавление/toggle/несколько эмодзи) | 100% | 3 |
| API: Закреплённые (pin/unpin/список) | 100% | 3 |
| API: Поиск по сообщениям (полнотекстовый) | 100% | 2 |
| API: Участники (добавление/удаление) | 100% | 2 |
| UI: Навигация (переход /chat, список, пустое состояние) | 100% | 3 |
| UI: Список чатов (отображение, поиск, выбор, новый чат) | 100% | 4 |
| UI: Отправка сообщений (textarea, Enter, Shift+Enter, кнопка, микрофон) | 100% | 6 |
| UI: Вложения файлов (прикрепление, превью, удаление, отправка) | 100% | 4 |
| UI: Ответ на сообщение (hover, reply preview, отмена, отправка) | 100% | 4 |
| UI: Контекстное меню (правый клик, пункты, своё/чужое, копирование) | 100% | 5 |
| UI: Редактирование (inline input, сохранение, отмена) | 100% | 3 |
| UI: Удаление (soft delete) | 100% | 1 |
| UI: Реакции (hover, quick picker, добавление/удаление, подсветка) | 100% | 5 |
| UI: Закреплённые сообщения (pin через меню, баннер, unpin) | 100% | 3 |
| UI: Поиск (панель, debounce, результаты, счётчик, навигация, закрытие) | 100% | 8 |
| UI: Меню и участники (панель, список, добавление, удаление, выход) | 100% | 8 |
| UI: Header (имя, статус участников) | 100% | 2 |

### Хелперы Chat (test-utils.ts)

- **Чаты:** `getConversationsApi`, `createConversationApi`
- **Сообщения:** `sendMessageApi`, `getMessagesApi`, `editMessageApi`, `deleteMessageApi`
- **Реакции:** `toggleReactionApi`
- **Закреплённые:** `pinMessageApi`, `unpinMessageApi`, `getPinnedMessagesApi`
- **Поиск:** `searchChatMessagesApi`
- **Участники:** `addChatParticipantsApi`, `removeChatParticipantApi`
- **Прочее:** `getUnreadCountsApi`, `getUsersListApi`

### Селекторы (selectors.ts)

- `chat` — 65+ селекторов, организованных по группам:
  - **Страница:** page, emptyState
  - **Список чатов:** conversationList, convSearch, newBtn
  - **ChatView:** view, pinnedBanner
  - **Header:** header, headerName, headerStatus, searchBtn, menuBtn
  - **Input:** input, textarea, sendBtn, attachBtn, fileInput, micBtn, replyPreview, cancelReplyBtn, pendingFiles, dropZone, recording, recordingCancel, recordingSend
  - **Сообщение:** messageBubble, messageContent, messagePinIcon, messageEdited, systemMessage, editInput
  - **Реакции:** reactionBar, reaction, hoverReply, hoverReaction, quickReactions
  - **Контекстное меню:** contextMenu, ctxReply, ctxCopy, ctxPin, ctxEdit, ctxDelete
  - **Поиск:** searchPanel, searchInput, searchCount, searchResults, searchResult, searchUp, searchDown, searchClose, searchEmpty
  - **Меню участников:** menuPanel, menuParticipants, menuParticipantCount, menuAddBtn, menuParticipant, menuRemoveBtn, menuLeaveBtn, menuMemberSearch, menuAddUser

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
