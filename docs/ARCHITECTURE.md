# Архитектура Stankoff Portal

## Обзор

Корпоративная система управления цифровыми рабочими местами. Гибкие workspaces для отделов (техподдержка, рекламации, склад, продажи) с кастомизируемыми полями, BPMN процессами, AI-ассистентом и интеграцией с legacy CRM.

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  Next.js 16 (App Router) · React 19 · Zustand · Socket.IO     │
│  Tailwind CSS 4 · bpmn-js · dmn-js · Tiptap · @dnd-kit       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/REST + WebSocket
┌──────────────────────────┴──────────────────────────────────────┐
│                         BACKEND                                  │
│  NestJS 11 · TypeORM · Socket.IO Gateway · @camunda8/sdk       │
│  class-validator · Zod · OpenAI SDK · Nodemailer               │
└──────────┬───────────────┬────────────────┬─────────────────────┘
           │               │                │
    ┌──────┴──────┐  ┌────┴─────┐  ┌───────┴────────┐
    │ PostgreSQL  │  │  Zeebe   │  │  Yandex Cloud  │
    │ 16 (pgvec) │  │  8.7     │  │  S3 + LLM      │
    └─────────────┘  └──────────┘  └────────────────┘
```

## Backend модули (25)

| Модуль | Назначение |
|--------|-----------|
| **ai** | LLM классификация, RAG поиск, AI-ассистент, уведомления, feedback, knowledge graph |
| **analytics** | Аналитика, materialized views, process mining |
| **audit-log** | Журнал действий пользователей |
| **auth** | Keycloak SSO, JWT, dev-auth |
| **automation** | Триггеры автоматизации |
| **bpmn** | BPMN процессы, Zeebe, worker'ы, instances, user tasks, incidents, forms |
| **chat** | Корпоративный мессенджер (conversations, messages, reactions, pins) |
| **connectors** | Внешние интеграции |
| **dmn** | Decision Tables (таблицы решений) |
| **email** | Отправка писем (Nodemailer) |
| **entity** | Сущности (заявки), комментарии |
| **geocoding** | Yandex Geocoder API |
| **health** | Health check endpoints |
| **invitation** | Приглашение сотрудников по email |
| **knowledge-base** | База знаний (FAQ, документы) |
| **legacy** | Legacy CRM (MariaDB), миграция, синхронизация, системные справочники (контрагенты, контакты, товары) |
| **onboarding** | Onboarding сотрудников |
| **rbac** | Роли и permissions (permission-based, 8 системных ролей) |
| **s3** | Yandex Object Storage (S3-compatible) |
| **search** | Полнотекстовый поиск (tsvector) |
| **section** | Разделы (группировка workspaces) |
| **sla** | Service Level Agreement |
| **user** | Пользователи, профили |
| **websocket** | WebSocket, events gateway |
| **workspace** | Рабочие места (включая системные: контрагенты, контакты, товары) |

## Frontend компоненты (22 категории)

| Категория | Назначение |
|-----------|-----------|
| **admin** | RoleList, RoleEditor, InvitationList, PermissionTree |
| **ai** | AiAssistantTab, AiClassificationPanel, AiNotifications |
| **analytics** | Графики, дашборды |
| **auth** | AuthProvider |
| **bpmn** | BpmnEditor, BpmnViewer, ProcessInstancesList |
| **chat** | ChatList, MessageList, ChatInput, Reactions |
| **dmn** | DmnEditor, DmnViewer |
| **entity** | EntityDetailPanel, CommentEditor, ActivityPanel, LinkedEntities |
| **fields** | FieldPalette, FieldEditor, FieldCard (13 типов полей) |
| **forms** | Формы для user tasks |
| **kanban** | KanbanBoard, KanbanColumn, KanbanCard (DnD) |
| **knowledge-base** | KnowledgeBasePage, ArticleCard, DocumentUpload |
| **layout** | Header, Sidebar, Breadcrumbs, NotificationPanel, GlobalSearch |
| **legacy** | CustomerPicker, ProductPicker, CounterpartyPicker, DealLink |
| **onboarding** | OnboardingWizard |
| **rbac** | PermissionTree, RoleAssignment |
| **section** | SectionList, SectionMembers |
| **sla** | SlaDashboard, SlaStatus |
| **table** | TableView (пагинация, сортировка) |
| **ui** | Button, Dialog, Input, Badge, Toast и др. |
| **workspace** | WorkspaceBuilder, WorkspaceMembers, AutomationRules |

## Zustand stores (18)

| Store | Назначение |
|-------|-----------|
| `useAuthStore` | Auth (user, token, isAuthenticated) |
| `useEntityStore` | Entities (список, кэш, фильтры) |
| `useTaskStore` | User tasks (inbox) |
| `useChatStore` | Чаты (conversations, messages) |
| `usePermissionStore` | Текущие permissions |
| `useWorkspaceStore` | Текущий workspace |
| `useSectionStore` | Разделы |
| `useSlaStore` | SLA статусы |
| `useKnowledgeBaseStore` | KB статьи |
| `useAiStore` | AI классификация, notifications |
| `useThemeStore` | Тема (dark/light) |
| `useSidebarStore` | Состояние sidebar |
| `useOnboardingStore` | Onboarding прогресс |
| `useNotificationStore` | Toast уведомления |
| `usePresenceStore` | Онлайн-пользователи |

## RBAC (Permission-based)

- Формат: `{scope}:{resource}:{action}` с wildcard `*`
- 3 scope: **global**, **section**, **workspace**
- 8 системных ролей: super_admin, department_head, employee, section_admin, section_viewer, ws_admin, ws_editor, ws_viewer
- Аддитивная модель: effectivePermissions = globalRole ∪ sectionRole ∪ workspaceRole
- Кэш: in-memory Map, TTL 5 мин
- Frontend: `usePermissionStore` + `useCan()` hook + `<Can>` компонент

## База данных

- **PostgreSQL 16** с pgvector для embeddings (256 dims)
- `synchronize: false` — только миграции
- `migrationsRun: true` — автоприменение при старте
- **Полнотекстовый поиск:** tsvector колонки + триггеры в `entities`, `comments`
- **Кэшированные поля:** commentCount, lastActivityAt, firstResponseAt, resolvedAt
- **Materialized Views:** mv_workspace_stats, mv_assignee_stats, mv_daily_activity (обновление каждые 5 мин)
- **knowledge_chunks:** RAG данные, hybrid search (vector + ts_rank_cd)

## Seed данные

- 87 реальных сотрудников из legacy CRM
- 9 секций, 18 workspaces (Продажи, Сервис, Маркетинг, Склад, Финансы, Юридический, Управление, IT, Справочники)
- 3 системных workspace: Контрагенты (CO), Контакты (CT), Товары (PR) — синхронизация из legacy cron каждые 30 мин
- 10 BPMN definitions → deploy в Zeebe
- IT workspace: 25 задач разработки с диалогами
- Оркестратор: cleanup → users → rbac → keycloak → structure → entities → it-department → user-groups → system-workspaces → bpmn → sla-dmn → knowledge-base

## AI

- **Yandex Cloud** — основной: YandexGPT (LLM) + text-search-doc (embeddings 256d)
- **OpenAI** — fallback (платный)
- RAG: legacy заявки → knowledge_chunks → hybrid search (vector + full-text)
- **Confidence gating:** минимальный similarity порог 0.7, средняя релевантность >= 0.65 — при низкой уверенности AI помощник показывает empty state вместо нерелевантных результатов
- Классификация: категория + приоритет + навыки (Zod validation)
- Streaming: SSE для генерации ответов
- Embedding cache: in-memory, TTL 5 мин, макс 200 записей
