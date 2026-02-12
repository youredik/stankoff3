# API Reference

## Авторизация

**Keycloak SSO:**
- `GET /api/auth/keycloak/login` — редирект на Keycloak
- `GET /api/auth/keycloak/callback` — callback после авторизации
- `GET /api/auth/me` — текущий пользователь
- `POST /api/auth/refresh` — обновление access token
- `POST /api/auth/logout` — выход (очистка cookies + Keycloak logout URL)

**Dev Auth** (только `AUTH_DEV_MODE=true`, не production):
- `GET /api/auth/dev/users` — список пользователей
- `POST /api/auth/dev/login` — вход по email → `{ accessToken }` + refresh cookie

## RBAC (роли и права)

- `GET /api/rbac/roles` — список ролей (?scope=global|section|workspace)
- `GET /api/rbac/roles/:id` — детали роли
- `POST /api/rbac/roles` — создать роль
- `PUT /api/rbac/roles/:id` — обновить роль
- `DELETE /api/rbac/roles/:id` — удалить (не системную)
- `GET /api/rbac/permissions` — реестр всех permissions
- `GET /api/rbac/permissions/my` — мои effective permissions (?workspaceId=)
- `GET /api/rbac/permissions/my/workspaces` — permissions по всем workspace
- `POST /api/rbac/assign/global` — назначить глобальную роль

## Entities (заявки)

- `GET/POST /api/entities` — список/создание
- `GET /api/entities/kanban` — канбан (query: workspaceId, perColumn, search, assigneeId[], priority[], dateFrom, dateTo, customFilters)
- `GET /api/entities/table` — таблица (query: workspaceId, page, perPage, sortBy, sortOrder, search, assigneeId[], priority[], status[], dateFrom, dateTo, customFilters)
- `GET /api/entities/kanban/column` — подгрузка колонки (query: workspaceId, status, offset, limit)
- `GET /api/entities/facets` — фасеты для фильтров (builtIn + custom)
- `PATCH /api/entities/:id/status` — изменить статус
- `PATCH /api/entities/:id/assignee` — назначить исполнителя
- `DELETE /api/entities/cleanup/test-data` — очистка тестовых данных (E2E)

## Comments

- `GET /api/comments/entity/:id` — комментарии сущности
- `POST /api/comments/entity/:id` — создать комментарий

## Workspaces

- `GET/POST/PUT /api/workspaces` — CRUD
- `PATCH /api/workspaces/:id/section` — изменить раздел
- `PATCH /api/workspaces/:id/show-in-menu` — показать/скрыть в меню
- `POST /api/workspaces/reorder` — изменить порядок

## Sections (разделы)

- `GET /api/sections` — список
- `POST /api/sections` — создать (только админ)
- `PUT /api/sections/:id` — обновить
- `DELETE /api/sections/:id` — удалить (только пустой)
- `POST /api/sections/reorder` — порядок
- `GET /api/sections/my-roles` — роли пользователя
- `GET/POST/PUT/DELETE /api/sections/:id/members` — участники

## Search

- `GET /api/search?q=текст` — глобальный поиск
- `GET /api/search/entities?q=текст` — по заявкам
- `GET /api/search/comments?q=текст` — по комментариям

## Files

- `POST /api/files/upload` — загрузка файлов

## BPMN (бизнес-процессы)

**Definitions:**
- `GET /api/bpmn/health` — статус Zeebe
- `GET /api/bpmn/definitions?workspaceId=...` — список процессов
- `POST /api/bpmn/definitions` — создать/обновить
- `POST /api/bpmn/definitions/:id/deploy` — развернуть в Zeebe
- `GET /api/bpmn/definition/:id/versions` — история версий
- `GET /api/bpmn/definition/:id/versions/:version` — конкретная версия
- `POST /api/bpmn/definition/:id/rollback/:version` — откат

**Instances:**
- `GET /api/bpmn/instances/workspace/:id` — экземпляры workspace
- `GET /api/bpmn/instances/entity/:id` — процессы сущности
- `GET /api/bpmn/instances/:instanceId/timeline` — timeline
- `POST /api/bpmn/instances` — запустить процесс
- `GET /api/bpmn/statistics/definition/:id` — статистика

**Process Mining:**
- `GET /api/bpmn/mining/definitions/:id/stats` — статистика
- `GET /api/bpmn/mining/definitions/:id/time-analysis` — анализ по времени
- `GET /api/bpmn/mining/definitions/:id/element-stats` — per-element (heat map)
- `GET /api/bpmn/mining/workspaces/:workspaceId/stats` — по workspace

**Triggers:**
- `GET /api/bpmn/triggers?workspaceId=...` — список
- `POST /api/bpmn/triggers` — создать
- `PUT /api/bpmn/triggers/:id` — обновить
- `PATCH /api/bpmn/triggers/:id/toggle` — вкл/выкл
- `DELETE /api/bpmn/triggers/:id` — удалить
- `POST /api/bpmn/triggers/webhook/:triggerId` — webhook (HMAC-SHA256)

**User Tasks (Inbox):**
- `GET /api/bpmn/tasks/inbox` — задачи пользователя (page, perPage, sortBy, sortOrder)
- `GET /api/bpmn/tasks` — фильтрация задач
- `GET /api/bpmn/tasks/:id` — детали с формой
- `POST /api/bpmn/tasks/batch/claim` — массовый claim
- `POST /api/bpmn/tasks/batch/delegate` — массовое делегирование
- `POST /api/bpmn/tasks/:id/claim` — взять
- `POST /api/bpmn/tasks/:id/unclaim` — отпустить
- `POST /api/bpmn/tasks/:id/complete` — завершить
- `POST /api/bpmn/tasks/:id/delegate` — делегировать

**Incidents:**
- `GET /api/bpmn/incidents?workspaceId=...` — список
- `GET /api/bpmn/incidents/count?workspaceId=...` — количество (badge)
- `POST /api/bpmn/incidents/:id/retry` — повторить
- `POST /api/bpmn/incidents/:id/cancel` — отменить

**Form Definitions:**
- `GET /api/bpmn/forms?workspaceId=...` — список
- `GET/POST/PUT/DELETE /api/bpmn/forms/:id` — CRUD

**Entity Links:**
- `GET /api/bpmn/entity-links/entity/:id` — связи
- `GET /api/bpmn/entity-links/entity/:id/linked` — связанные сущности
- `POST /api/bpmn/entity-links` — создать связь
- `POST /api/bpmn/entity-links/spawn` — создать сущность и связать
- `DELETE /api/bpmn/entity-links/:id` — удалить

## SLA

- `GET /api/sla/definitions?workspaceId=...` — список
- `GET/POST/PUT/DELETE /api/sla/definitions/:id` — CRUD
- `GET /api/sla/status/:targetType/:targetId` — статус SLA
- `GET /api/sla/dashboard?workspaceId=...` — статистика
- `POST /api/sla/instances/:id/pause` — приостановить
- `POST /api/sla/instances/:id/resume` — возобновить

## DMN (Decision Tables)

- `GET /api/dmn/tables?workspaceId=...` — список
- `GET/POST/PUT/DELETE /api/dmn/tables/:id` — CRUD
- `POST /api/dmn/tables/:id/clone` — клонировать
- `POST /api/dmn/evaluate` — вычислить с логированием
- `POST /api/dmn/tables/:id/evaluate-quick` — быстрое вычисление
- `GET /api/dmn/tables/:id/evaluations` — история
- `GET /api/dmn/tables/:id/statistics` — статистика правил

## AI

**Классификация:**
- `GET /api/ai/health` — статус
- `POST /api/ai/classify` — классификация (категория, приоритет, навыки)
- `POST /api/ai/classify/:entityId` — с сохранением
- `GET /api/ai/classification/:entityId` — получить
- `POST /api/ai/classification/:entityId/apply` — применить к entity

**RAG поиск:**
- `POST /api/ai/search` — семантический поиск по базе знаний
- `GET /api/ai/knowledge-base/stats` — статистика

**AI Assistant:**
- `GET /api/ai/assist/:entityId` — подсказки (похожие случаи, эксперты, sentiment)
- `POST /api/ai/assist/:entityId/suggest-response` — генерация ответа
- `POST /api/ai/assist/:entityId/suggest-response/stream` — streaming (SSE)
- `GET /api/ai/assist/:entityId/summary` — резюме переписки

**RAG Indexer:**
- `GET /api/ai/indexer/health` — статус индексатора
- `GET /api/ai/indexer/status` — текущий статус
- `GET /api/ai/indexer/stats` — статистика
- `POST /api/ai/indexer/start` — запустить (body: `{ forceReindex? }`)
- `POST /api/ai/indexer/reindex/:requestId` — переиндексировать заявку

**Notifications (cron каждые 5 мин):**
- `GET /api/ai/notifications` — список (query: workspaceId, unreadOnly, limit, offset)
- `GET /api/ai/notifications/unread-count` — непрочитанные
- `PATCH /api/ai/notifications/:id/read` — прочитать
- `POST /api/ai/notifications/mark-all-read` — прочитать все
- `DELETE /api/ai/notifications/:id` — скрыть
- `POST /api/ai/notifications/toggle` — вкл/выкл анализ

**Knowledge Graph:**
- `GET /api/ai/knowledge-graph/:entityId` — граф связей

**Feedback:**
- `POST /api/ai/feedback` — отправить (body: `{ type, entityId, rating, metadata? }`)
- `GET /api/ai/feedback/stats` — статистика
- `GET /api/ai/feedback/entity/:entityId` — feedback для entity

## Chat (корпоративный мессенджер)

- `GET /api/chat/conversations` — чаты пользователя (query: search)
- `POST /api/chat/conversations` — создать чат (body: type, name?, entityId?, participantIds)
- `GET /api/chat/conversations/:id` — детали
- `GET /api/chat/conversations/:id/messages` — сообщения (cursor-пагинация)
- `POST /api/chat/conversations/:id/messages` — отправить
- `PATCH /api/chat/conversations/:id/messages/:msgId` — редактировать
- `DELETE /api/chat/conversations/:id/messages/:msgId` — удалить (soft)
- `POST /api/chat/conversations/:id/read` — прочитать
- `POST /api/chat/conversations/:id/participants` — добавить участников
- `DELETE /api/chat/conversations/:id/participants/:userId` — удалить
- `GET /api/chat/conversations/for-entity/:entityId` — чат заявки
- `GET /api/chat/unread-counts` — непрочитанные
- `GET /api/chat/search?q=текст` — поиск
- `POST /api/chat/conversations/:id/messages/:msgId/reactions` — toggle реакции
- `GET /api/chat/conversations/:id/pinned` — закреплённые
- `POST /api/chat/conversations/:id/messages/:msgId/pin` — закрепить
- `DELETE /api/chat/conversations/:id/messages/:msgId/pin` — открепить

## Legacy CRM

**Данные (read-only, MariaDB):**
- `GET /api/legacy/health` — статус
- `GET /api/legacy/customers/search?q=текст` — клиенты
- `GET /api/legacy/customers/:id` — клиент
- `GET /api/legacy/products/search?q=текст` — товары
- `GET /api/legacy/products/:id` — товар
- `GET /api/legacy/categories` — категории
- `GET /api/legacy/counterparties/search?q=текст` — контрагенты
- `GET /api/legacy/counterparties/:id` — контрагент
- `GET /api/legacy/deals` — сделки
- `GET /api/legacy/deals/:id` — сделка

**Migration:**
- `GET /api/legacy/migration/status` — статус
- `GET /api/legacy/migration/preview` — превью
- `POST /api/legacy/migration/start` — запуск
- `POST /api/legacy/migration/stop` — остановка
- `GET /api/legacy/migration/progress` — прогресс
- `POST /api/legacy/migration/validate` — проверка
- `GET /api/legacy/migration/log` — лог
- `POST /api/legacy/migration/retry-failed` — повтор ошибок
- `POST /api/legacy/migration/update-assignees` — обновить assignee

**Sync (cron каждые 5 мин):**
- `GET /api/legacy/sync/status` — статус
- `POST /api/legacy/sync/enable` — включить
- `POST /api/legacy/sync/disable` — выключить
- `POST /api/legacy/sync/run-now` — вручную

## Knowledge Base

- `GET /api/knowledge-base/articles` — список (query: type, category, workspaceId, search, page, perPage)
- `GET /api/knowledge-base/articles/:id` — детали
- `POST /api/knowledge-base/articles` — создать FAQ
- `POST /api/knowledge-base/articles/upload` — загрузить документ
- `PUT /api/knowledge-base/articles/:id` — обновить
- `DELETE /api/knowledge-base/articles/:id` — удалить
- `GET /api/knowledge-base/categories` — категории
- `GET /api/knowledge-base/stats` — статистика

## Invitations

- `GET /api/invitations` — список [global:user:manage]
- `POST /api/invitations` — создать [global:user:manage]
- `POST /api/invitations/bulk` — массовое (до 50) [global:user:manage]
- `POST /api/invitations/:id/revoke` — отозвать
- `POST /api/invitations/:id/resend` — переотправить
- `GET /api/invitations/verify/:token` — проверить (@Public)
- `POST /api/invitations/accept` — принять (@Public, body: token, password)

## Geocoding

- `GET /api/geocoding/search?q=адрес` — адрес → координаты
- `GET /api/geocoding/reverse?lat=55.75&lng=37.61` — координаты → адрес

## OG Preview

- `GET /api/og-preview?url=...` — OG meta-теги страницы

---

## WebSocket события

**Entities:**
- `entity:created`, `entity:updated` — создание/обновление
- `status:changed` — смена статуса
- `comment:created` — новый комментарий
- `user:assigned` — назначение

**BPMN Tasks:**
- `task:created`, `task:updated` — lifecycle (inbox без polling)
- `task:reminder` — напоминание (за 1 час)
- `task:overdue` — просроченная задача
- `process:incident` — процесс зависнул

**AI:**
- `ai:classification:ready` — автоклассификация завершена
- `ai:notification` — проактивное уведомление

**Chat:**
- `chat:message` — новое сообщение
- `chat:message:edited` — отредактировано
- `chat:message:deleted` — удалено
- `chat:typing` — печатает
- `chat:read` — прочитано
- `chat:conversation:created` — новый чат
- `chat:conversation:updated` — обновлён
- `chat:reaction` — реакция
- `chat:message:pinned` / `chat:message:unpinned` — закрепление
- `chat:join` / `chat:leave` (client → server) — подписка на room

**System:**
- `auth:refresh` (client → server) — обновление JWT
- `presence:update` — онлайн-пользователи
- `rbac:permissions:changed` — permissions изменились (targeted по userId)
