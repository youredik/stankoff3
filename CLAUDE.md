# Правила для ИИ-агента (Claude)

## Язык общения

**ВАЖНО:** Всегда отвечай на русском языке. Проект разрабатывается для русскоязычных пользователей.

## Стек технологий

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, @dnd-kit, Tiptap, Socket.IO Client, bpmn-js
- **Backend:** NestJS 11, TypeORM, PostgreSQL (pgvector), Socket.IO, AWS SDK v3 (S3), @camunda8/sdk, OpenAI SDK
- **BPMN:** Camunda 8 Platform, Zeebe workflow engine, BPMN 2.0
- **Инфраструктура:** Docker Swarm (preprod), Docker Compose (dev), Yandex Object Storage, GitHub Actions CI/CD, Nginx, Let's Encrypt SSL
- **Деплой:** GitHub Container Registry (GHCR), Docker multi-platform builds (AMD64), Zero-downtime deployment (Swarm start-first)

## Структура проекта

```
stankoff-portal/
├── apps/
│   ├── frontend/          # Next.js приложение
│   │   ├── src/
│   │   │   ├── app/       # App Router страницы
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/api/   # API клиенты
│   │   │   ├── store/     # Zustand stores
│   │   │   └── types/
│   │   └── package.json
│   └── backend/           # NestJS приложение
│       ├── src/
│       │   ├── modules/   # NestJS модули
│       │   └── main.ts
│       └── package.json
├── docs/                  # Документация
└── package.json           # Корневой package.json (npm workspaces)
```

## Правила разработки

### Общие принципы

1. **Прагматичная чистая архитектура** — применяй Clean Architecture прагматично, а не догматически:
   - Выделяй доменный слой (сущности + use cases) без зависимостей от фреймворков
   - Используй интерфейсы для инфраструктуры (репозитории, внешние сервисы)
   - **Не создавай** лишних абстракций там, где замена маловероятна
   - Начинай с разумной структуры и усложняй по мере реальной необходимости
   - В будущем проект будет переведён на микросервисы — учитывай это при проектировании границ модулей
2. **Не усложняй** — пиши минимально необходимый код для решения задачи
3. **Не добавляй лишнего** — никаких "улучшений" сверх запроса пользователя
4. **Редактируй существующее** — предпочитай изменение файлов созданию новых
5. **Проверяй работоспособность** — после изменений убедись, что код работает
6. **Всегда документируй** — после любых изменений обновляй документацию
7. **Перезапускай сервисы сам** — после изменений в backend перезапускай сервер самостоятельно, не проси пользователя

### Документирование (ОБЯЗАТЕЛЬНО)

После завершения любой задачи **всегда** обновляй документацию:

1. **docs/ARCHITECTURE.md** — при изменениях в:
   - Структуре компонентов
   - API эндпоинтах
   - WebSocket событиях
   - Stores и их методах
   - Типах данных

2. **CLAUDE.md** — при изменениях в:
   - Стеке технологий
   - Структуре проекта
   - Командах запуска

3. **Что документировать:**
   - Новые компоненты и их назначение
   - Новые API эндпоинты
   - Новые WebSocket события
   - Изменения в интерфейсах типов
   - Новые stores или методы в существующих

### Тестирование (ОБЯЗАТЕЛЬНО)

**КРИТИЧЕСКИ ВАЖНО:** Весь новый функционал должен быть покрыт тестами на 100%!

**Pre-commit hooks:**
- Настроен husky для автоматической проверки перед коммитом
- Коммит будет отклонён если тесты не проходят
- Проверяется: TypeScript компиляция (backend + frontend) и unit-тесты backend

**Команды тестирования:**
```bash
# Unit тесты backend
npm run test                  # Запуск unit-тестов
npm run test:coverage         # Тесты с отчётом о покрытии

# E2E тесты frontend (Playwright)
npm run test:e2e              # Все тесты
npm run test:e2e:headed       # Тесты с видимым браузером
npm run test:e2e:ui           # Интерактивный UI
```

**Требования к тестам:**
1. **Каждый новый сервис** должен иметь `*.spec.ts` файл рядом
2. **Каждый контроллер** должен иметь unit-тесты для всех endpoints
3. **Мокировать** внешние зависимости (БД, API, S3)
4. **Тестировать** как happy path, так и error cases
5. **Использовать** строгие типы в тестах (минимизировать `any`)

**Пример структуры теста:**
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  let dependency: jest.Mocked<Dependency>;

  beforeEach(async () => {
    // Создание моков и модуля
  });

  describe('methodName', () => {
    it('должен вернуть результат при успехе', async () => {
      // Arrange, Act, Assert
    });

    it('должен обработать ошибку', async () => {
      // Тест error case
    });
  });
});
```

### Проверка работоспособности (ОБЯЗАТЕЛЬНО)

После любых изменений в коде **всегда** проверяй:

1. **Unit тесты backend:**
   ```bash
   npm run test
   ```

2. **E2E тесты (Playwright):**
   ```bash
   cd apps/frontend && npm run test:e2e
   ```

3. **TypeScript компиляция:**
   ```bash
   cd apps/frontend && npm run build
   cd apps/backend && npm run build
   ```

4. **Что проверять:**
   - Unit тесты проходят
   - E2E тесты проходят
   - Нет ошибок TypeScript
   - Нет runtime ошибок в консоли браузера
   - Нет ошибок 500 от API

5. **При ошибках:**
   - Исправь ошибку
   - Проверь снова
   - Только потом переходи к документированию

### Frontend

- Используй `'use client'` только когда нужны хуки или браузерные API
- Состояние храни в Zustand stores
- Стили — Tailwind CSS классы, без отдельных CSS файлов
- Компоненты размещай по функциональности: `kanban/`, `table/`, `entity/`, `workspace/`, `layout/`, `ui/`, `bpmn/`
- Компоненты с bpmn-js используй только с `dynamic(() => import(...), { ssr: false })` — библиотека требует браузерных API

**API запросы:**
- **ВАЖНО:** Всегда используй относительные пути для API запросов (начинающиеся с `/api/`)
- `apiClient` автоматически добавляет префикс `/api` в браузере
- Next.js rewrites проксируют `/api/*` на backend (см. `next.config.ts`)
- Это обеспечивает корректную работу cookies (refresh token в HttpOnly cookie)
- Примеры:
  - ✅ `apiClient.get('/workspaces')` → `/api/workspaces` → backend
  - ✅ `fetch('/api/auth/me')` → rewrites → backend
  - ❌ `fetch('http://localhost:3001/api/auth/me')` → обход rewrites, cookies не работают

**Авторизация:**
- Production/Preprod: **Keycloak SSO** — `/login` автоматически редиректит на Keycloak
- **Dev mode** (`AUTH_DEV_MODE=true`): страница `/login` показывает карточки пользователей для быстрого входа без Keycloak
- `AuthProvider` обрабатывает токен из URL после callback
- Access token хранится в памяти (Zustand), refresh token в HttpOnly cookie

### Backend

- Один модуль = одна сущность (Entity, Workspace, User, Comment)
- WebSocket события эмитируй через EventsGateway
- Валидация через class-validator в DTO
- Пароли скрывай через `@Exclude()` декоратор

### Типы

- Общие типы определяй в `apps/frontend/src/types/index.ts`
- Поле `status` с типом `FieldOption[]` определяет колонки канбана
- `Attachment` содержит: id, name, size, url, mimeType

## Окружения и деплой

### Окружения

| Окружение | Ветка | Домен | Автодеплой | Сервер |
|-----------|-------|-------|------------|--------|
| **Preprod** | `develop` | preprod.stankoff.ru | ✅ Да | 51.250.117.178 |
| **Production** | `main` | bpms.stankoff.ru | ⏸️ Пока отключен | TBD |
| **Development** | Любая | localhost:3000 | — | Локально |

### Keycloak SSO

**ВАЖНО:** Проект использует **внешний Keycloak**, не контейнеризованный.
- Keycloak URL: `https://new.stankoff.ru/oidc/`
- Realm для preprod: `stankoff-preprod`
- Keycloak сервис **удален** из всех docker-compose файлов
- Конфигурация через переменные окружения (`KEYCLOAK_URL`, `KEYCLOAK_REALM`, etc.)
- Nginx **не проксирует** `/auth/` — это внешний сервис

**⚠️ КРИТИЧЕСКИ ВАЖНО:**
- Realm `stankoff` используется для **другого проекта** и **НЕ ДОЛЖЕН** изменяться
- Для preprod окружения **обязательно** использовать realm `stankoff-preprod`
- Для production окружения будет создан отдельный realm (TBD)

**Кастомная тема Keycloak:**
- Создана тема в корпоративном стиле с бирюзовыми акцентами
- Директория: `keycloak-theme/stankoff-portal/`
- Применяется только к realm `stankoff-preprod` (не к `stankoff`!)
- Инструкции по установке: `keycloak-theme/README.md`
- Поддерживает русский и английский языки

### База данных и миграции

**ВАЖНО:** `synchronize: false` **везде** (dev, preprod, production). Все изменения схемы БД — только через миграции!

**Команды миграций:**
```bash
cd apps/backend

# Сгенерировать миграцию после изменения entity
npm run migration:generate -- src/migrations/DescriptiveName

# Применить все pending миграции
npm run migration:run

# Откатить последнюю миграцию
npm run migration:revert

# Показать статус миграций
npm run migration:show
```

**Workflow разработчика:**
1. Изменить entity файл (добавить поле, индекс и т.д.)
2. `npm run migration:generate -- src/migrations/AddNewField`
3. Проверить сгенерированный SQL в файле миграции
4. `npm run migration:run` — применить локально
5. Закоммитить entity + миграцию **вместе**
6. При деплое миграции применятся автоматически (`migrationsRun: true`)

**Правила для миграций:**
- TypeORM генерирует B-tree индексы автоматически через `@Index()` декоратор
- GIN индексы (для JSONB) добавляй **вручную** в SQL миграции
- Не смешивай данные и схему — данные заполняй через seed
- Миграция должна быть **идемпотентной** (можно запустить повторно)
- Используй `IF EXISTS` / `IF NOT EXISTS` в SQL

**Полнотекстовый поиск:**
- Таблицы `entities` и `comments` имеют колонку `searchVector` (tsvector)
- Триггеры автоматически обновляют поисковый вектор при INSERT/UPDATE
- API: `GET /api/search?q=текст&workspaceId=uuid`

**Кэшированные поля в entities:**
- `commentCount` — количество комментариев (обновляется триггером)
- `lastActivityAt` — последняя активность
- `firstResponseAt` — время первого ответа (SLA)
- `resolvedAt` — когда заявка закрыта

**Materialized Views:**
- `mv_workspace_stats` — статистика по workspace и статусам
- `mv_assignee_stats` — статистика по исполнителям
- `mv_daily_activity` — активность по дням
- Обновлять через `AnalyticsService.refreshMaterializedViews()` (каждые 5 минут)

### CI/CD Pipeline

GitHub Actions автоматически деплоит при push в `develop` или `main`:

```
Push в ветку
    ↓
1. Lint & Type Check
2. Backend Tests
3. Frontend Tests
    ↓
4. Build Docker Images (AMD64)
5. Push to GitHub Container Registry
    ↓
6. Deploy to Server (SSH)
```

**Требуемые GitHub Secrets:**
- `PREPROD_HOST` — IP адрес preprod сервера
- `PREPROD_USER` — SSH пользователь
- `PREPROD_SSH_KEY` — Приватный SSH ключ (весь, включая BEGIN/END)
- `GHCR_TOKEN` — Personal Access Token с `write:packages`, `read:packages`

**Docker образы:** `ghcr.io/youredik/stankoff3/frontend:preprod`, `ghcr.io/youredik/stankoff3/backend:preprod`

### Docker Swarm (Zero-Downtime Deployment)

Preprod использует Docker Swarm для zero-downtime деплоя:

```yaml
deploy:
  update_config:
    order: start-first      # Сначала стартует новый контейнер
    failure_action: rollback # При ошибке — откат
  restart_policy:
    condition: any
```

**Как это работает:**
1. Swarm создаёт новый контейнер
2. Ждёт пока healthcheck пройдёт
3. Перенаправляет трафик на новый контейнер
4. Удаляет старый контейнер

**Известные проблемы:**
- **IPv6/IPv4:** На сервере `localhost` резолвится в IPv6 (`::1`), но nginx слушает только IPv4. Используй `127.0.0.1` вместо `localhost` в healthcheck
- **nginx proxy_pass с переменными:** При использовании переменной в `proxy_pass` (для динамического DNS в Swarm) nginx НЕ добавляет автоматически оставшуюся часть URI. Используй `proxy_pass http://$var;` без пути
- **Именование томов:** Docker Swarm добавляет префикс стека к томам (`stankoff-preprod_postgres-data`). Чтобы использовать существующие тома с данными, объяви их как `external: true` с указанием оригинального имени
- **Пароль PostgreSQL:** При инициализации БД пароль сохраняется в данных PostgreSQL. Если том уже существует, переменная `POSTGRES_PASSWORD` игнорируется. При смене пароля в `.env.preprod` нужно вручную выполнить `ALTER USER postgres WITH PASSWORD 'new_password';`

**Файлы конфигурации:**
- `docker-compose.preprod.yml` — Swarm stack для preprod
- `nginx/nginx.preprod.conf` — Nginx с динамическим DNS resolver

### SSL сертификаты

- **Preprod:** Let's Encrypt через Certbot (автообновление каждые 12 часов)
- **Production:** Let's Encrypt (будет настроено позже)
- Сертификаты в volume `certbot-conf`, ACME challenge через nginx

## Команды

```bash
# Разработка
npm run dev              # Запуск frontend + backend
npm run docker:up        # PostgreSQL + pgAdmin

# Отдельно
npm run dev:frontend     # Только frontend (порт 3000)
npm run dev:backend      # Только backend (порт 3001)

# База данных
npm run db:seed          # Заполнить тестовыми данными

# Camunda / Zeebe (BPMN)
docker compose -f docker-compose.camunda.yml up -d  # Запустить Camunda (Zeebe + Operate + Tasklist)
# UI: http://localhost:8088 (demo/demo)
# gRPC: localhost:26500

# AI / Ollama (локальные модели, бесплатно)
./scripts/setup-ollama.sh                            # Полная настройка Ollama с моделями
docker compose -f docker-compose.ollama.yml up -d    # Запустить Ollama
docker compose -f docker-compose.ollama.yml exec ollama ollama list  # Список моделей
# API: http://localhost:11434
# Модели: qwen2.5:14b (LLM), nomic-embed-text (embeddings)

# E2E тесты (Playwright)
cd apps/frontend
npm run test:e2e         # Запуск всех тестов (с автоочисткой)
npm run test:e2e:headed  # Тесты с видимым браузером
npm run test:e2e:ui      # Интерактивный UI для тестов

# Деплой
git push origin develop  # Автоматический деплой на preprod
git push origin main     # Автоматический деплой на production (пока отключен)

# Проверка preprod сервера (Docker Swarm)
ssh -l youredik 51.250.117.178 "docker stack services stankoff-preprod"           # Статус сервисов
ssh -l youredik 51.250.117.178 "docker service logs stankoff-preprod_backend -f"  # Логи backend
ssh -l youredik 51.250.117.178 "docker service logs stankoff-preprod_frontend -f" # Логи frontend
curl https://preprod.stankoff.ru/api/health  # Health check

# Сборка Docker образов (локально для тестирования)
docker buildx build --platform linux/amd64 -t ghcr.io/youredik/stankoff3/backend:preprod -f apps/backend/Dockerfile --push .
docker buildx build --platform linux/amd64 -t ghcr.io/youredik/stankoff3/frontend:preprod -f apps/frontend/Dockerfile --push .
```

> **Изоляция тестов:** E2E тесты автоматически очищают тестовые данные через `global-setup.ts` и `global-teardown.ts`. Очистка удаляет сущности с маркерами в названии (Playwright, Тест, DnD, и т.д.).

## API

**Авторизация (Keycloak SSO):**
- `GET /api/auth/keycloak/login` — редирект на Keycloak
- `GET /api/auth/keycloak/callback` — callback после авторизации
- `GET /api/auth/me` — текущий пользователь
- `POST /api/auth/refresh` — обновление access token
- `POST /api/auth/logout` — выход (очистка cookies + Keycloak logout URL)

**Dev Auth (только при AUTH_DEV_MODE=true, NODE_ENV !== production):**
- `GET /api/auth/dev/users` — список пользователей для dev login
- `POST /api/auth/dev/login` — вход по email (body: `{ email }`) → `{ accessToken }` + refresh cookie

**Основные эндпоинты:**
- `GET/POST /api/entities` — сущности (GET без пагинации — legacy)
- `GET /api/entities/kanban` — канбан с серверной пагинацией (query: workspaceId, perColumn, search, assigneeId[], priority[], dateFrom, dateTo)
- `GET /api/entities/table` — табличное представление с пагинацией, сортировкой (query: workspaceId, page, perPage, sortBy, sortOrder, search, assigneeId[], priority[], status[], dateFrom, dateTo)
- `GET /api/entities/kanban/column` — подгрузка колонки (query: workspaceId, status, offset, limit + фильтры)
- `PATCH /api/entities/:id/status` — изменение статуса
- `PATCH /api/entities/:id/assignee` — назначение исполнителя
- `DELETE /api/entities/cleanup/test-data` — очистка тестовых данных (E2E)
- `GET/POST /api/comments/entity/:id` — комментарии
- `GET/POST/PUT /api/workspaces` — рабочие места
- `PATCH /api/workspaces/:id/section` — изменить раздел workspace
- `PATCH /api/workspaces/:id/show-in-menu` — показывать/скрывать в меню
- `POST /api/workspaces/reorder` — изменить порядок workspaces
- `POST /api/files/upload` — загрузка файлов

**Разделы (группировка workspaces):**
- `GET /api/sections` — список доступных разделов
- `POST /api/sections` — создать раздел (только админ)
- `PUT /api/sections/:id` — обновить раздел
- `DELETE /api/sections/:id` — удалить раздел (только пустой)
- `POST /api/sections/reorder` — изменить порядок разделов
- `GET /api/sections/my-roles` — роли пользователя во всех разделах
- `GET/POST/PUT/DELETE /api/sections/:id/members` — управление участниками раздела

**Поиск:**
- `GET /api/search?q=текст` — глобальный поиск по заявкам и комментариям
- `GET /api/search/entities?q=текст` — поиск только по заявкам
- `GET /api/search/comments?q=текст` — поиск только по комментариям

**BPMN (бизнес-процессы):**
- `GET /api/bpmn/health` — статус подключения к Camunda/Zeebe
- `GET /api/bpmn/definitions?workspaceId=...` — список определений процессов
- `POST /api/bpmn/definitions` — создать/обновить определение
- `POST /api/bpmn/definitions/:id/deploy` — развернуть процесс в Zeebe (body: { changelog? })
- `GET /api/bpmn/definition/:id/versions` — история версий процесса
- `GET /api/bpmn/definition/:id/versions/:version` — конкретная версия с BPMN XML
- `POST /api/bpmn/definition/:id/rollback/:version` — откатить на версию
- `GET /api/bpmn/instances/workspace/:id` — экземпляры процессов workspace
- `GET /api/bpmn/instances/entity/:id` — процессы для сущности (заявки)
- `GET /api/bpmn/instances/:instanceId/timeline` — унифицированный timeline (activity logs + user tasks + lifecycle)
- `POST /api/bpmn/instances` — запустить процесс
- `GET /api/bpmn/statistics/definition/:id` — статистика по процессу

**BPMN Process Mining:**
- `GET /api/bpmn/mining/definitions/:id/stats` — Process Mining статистика
- `GET /api/bpmn/mining/definitions/:id/time-analysis` — анализ по времени
- `GET /api/bpmn/mining/definitions/:id/element-stats` — per-element статистика (heat map)
- `GET /api/bpmn/mining/workspaces/:workspaceId/stats` — статистика workspace

**BPMN Триггеры:**
- `GET /api/bpmn/triggers?workspaceId=...` — список триггеров
- `POST /api/bpmn/triggers` — создать триггер
- `PUT /api/bpmn/triggers/:id` — обновить триггер
- `PATCH /api/bpmn/triggers/:id/toggle` — включить/выключить
- `DELETE /api/bpmn/triggers/:id` — удалить триггер
- `POST /api/bpmn/triggers/webhook/:triggerId` — webhook endpoint (HMAC-SHA256: `X-Webhook-Signature: sha256=<hex>`, или plain: `X-Webhook-Secret: <ключ>`)

**BPMN User Tasks (Inbox):**
- `GET /api/bpmn/tasks/inbox` — задачи пользователя (пагинация: page, perPage, sortBy, sortOrder)
- `GET /api/bpmn/tasks` — фильтрация задач (пагинация: page, perPage, sortBy, sortOrder)
- `GET /api/bpmn/tasks/:id` — детали задачи с формой
- `POST /api/bpmn/tasks/batch/claim` — массовый claim (`{ taskIds: string[] }`)
- `POST /api/bpmn/tasks/batch/delegate` — массовое делегирование (`{ taskIds, targetUserId }`)
- `POST /api/bpmn/tasks/:id/claim` — взять задачу
- `POST /api/bpmn/tasks/:id/unclaim` — отпустить задачу
- `POST /api/bpmn/tasks/:id/complete` — завершить с данными формы
- `POST /api/bpmn/tasks/:id/delegate` — делегировать

**BPMN Incidents (Инциденты):**
- `GET /api/bpmn/incidents?workspaceId=...` — список инцидентов
- `GET /api/bpmn/incidents/count?workspaceId=...` — количество инцидентов (для badge)
- `POST /api/bpmn/incidents/:id/retry` — повторить (сброс статуса на active)
- `POST /api/bpmn/incidents/:id/cancel` — отменить (terminate process)

**BPMN Form Definitions (формы для user tasks):**
- `GET /api/bpmn/forms?workspaceId=...` — список определений форм
- `GET /api/bpmn/forms/:id` — детали определения формы
- `POST /api/bpmn/forms` — создать определение формы
- `PUT /api/bpmn/forms/:id` — обновить определение формы
- `DELETE /api/bpmn/forms/:id` — удалить определение формы

**BPMN Entity Links:**
- `GET /api/bpmn/entity-links/entity/:id` — связи сущности
- `GET /api/bpmn/entity-links/entity/:id/linked` — связанные сущности
- `POST /api/bpmn/entity-links` — создать связь
- `POST /api/bpmn/entity-links/spawn` — создать сущность и связать
- `DELETE /api/bpmn/entity-links/:id` — удалить связь

**SLA (Service Level Agreement):**
- `GET /api/sla/definitions?workspaceId=...` — список определений SLA
- `GET /api/sla/definitions/:id` — детали определения
- `POST /api/sla/definitions` — создать определение SLA
- `PUT /api/sla/definitions/:id` — обновить определение
- `DELETE /api/sla/definitions/:id` — удалить определение
- `GET /api/sla/status/:targetType/:targetId` — статус SLA для цели
- `GET /api/sla/dashboard?workspaceId=...` — статистика SLA
- `POST /api/sla/instances/:id/pause` — приостановить SLA
- `POST /api/sla/instances/:id/resume` — возобновить SLA

**DMN (Decision Tables):**
- `GET /api/dmn/tables?workspaceId=...` — список таблиц решений
- `GET /api/dmn/tables/:id` — детали таблицы
- `POST /api/dmn/tables` — создать таблицу
- `PUT /api/dmn/tables/:id` — обновить таблицу
- `DELETE /api/dmn/tables/:id` — удалить таблицу
- `POST /api/dmn/tables/:id/clone` — клонировать таблицу
- `POST /api/dmn/evaluate` — вычислить с логированием
- `POST /api/dmn/tables/:id/evaluate-quick` — быстрое вычисление
- `GET /api/dmn/tables/:id/evaluations` — история вычислений
- `GET /api/dmn/tables/:id/statistics` — статистика правил

**AI (LLM-ассистент, требует OPENAI_API_KEY):**
- `GET /api/ai/health` — статус AI сервиса
- `POST /api/ai/classify` — классификация заявки (категория, приоритет, навыки)
- `POST /api/ai/classify/:entityId` — классификация с сохранением в БД
- `GET /api/ai/classification/:entityId` — получить сохранённую классификацию
- `POST /api/ai/classification/:entityId/apply` — применить классификацию к entity
- `POST /api/ai/search` — RAG поиск по базе знаний (pgvector)
- `GET /api/ai/knowledge-base/stats` — статистика базы знаний

**AI RAG Indexer (индексация legacy данных):**
- `GET /api/ai/indexer/health` — статус RAG индексатора
- `GET /api/ai/indexer/status` — текущий статус индексации
- `GET /api/ai/indexer/stats` — статистика (legacy + knowledge base + покрытие)
- `POST /api/ai/indexer/start` — запустить индексацию legacy заявок
- `POST /api/ai/indexer/reindex/:requestId` — переиндексировать конкретную заявку

**Примечание по AI:**
RAG использует данные из legacy CRM (QD_requests + QD_answers). Результаты поиска включают ссылки на legacy систему (https://www.stankoff.ru/crm/request/:id). Индексация создаёт embeddings для закрытых заявок с ответами.

**Геокодирование (Yandex Geocoder API):**
- `GET /api/geocoding/search?q=адрес` — прямое геокодирование (адрес → координаты)
- `GET /api/geocoding/reverse?lat=55.75&lng=37.61` — обратное геокодирование (координаты → адрес)

**OG Preview:**
- `GET /api/og-preview?url=https://...` — получить OG meta-теги страницы (title, description, image, siteName)

**Legacy CRM (интеграция с MariaDB):**
- `GET /api/legacy/health` — статус подключения к legacy БД
- `GET /api/legacy/customers/search?q=текст&limit=10&employeesOnly=false` — поиск клиентов
- `GET /api/legacy/customers/:id` — получить клиента по ID
- `GET /api/legacy/products/search?q=текст&categoryId=123&inStockOnly=false` — поиск товаров
- `GET /api/legacy/products/:id` — получить товар по ID
- `GET /api/legacy/categories` — все категории товаров
- `GET /api/legacy/counterparties/search?q=текст` — поиск контрагентов по названию/ИНН
- `GET /api/legacy/counterparties/:id` — получить контрагента по ID
- `GET /api/legacy/deals?counterpartyId=123&employeeUserId=456` — сделки
- `GET /api/legacy/deals/:id` — получить сделку по ID

**Legacy Migration (миграция данных из legacy CRM):**
- `GET /api/legacy/migration/status` — готовность + прогресс миграции
- `GET /api/legacy/migration/preview` — превью (количества, маппинг сотрудников)
- `POST /api/legacy/migration/start` — запуск миграции (batchSize, maxRequests, dryRun)
- `POST /api/legacy/migration/stop` — graceful остановка
- `GET /api/legacy/migration/progress` — текущий прогресс (JSON)
- `POST /api/legacy/migration/validate` — проверка целостности после миграции
- `GET /api/legacy/migration/log?status=failed&limit=20` — записи migration log
- `POST /api/legacy/migration/retry-failed` — повтор ошибочных записей
- `POST /api/legacy/migration/update-assignees` — ретроактивное обновление assignee (manager.id → User.id)

**Legacy Sync (синхронизация новых данных):**
- `GET /api/legacy/sync/status` — статус синхронизации
- `POST /api/legacy/sync/enable` — включить cron-синхронизацию (каждые 5 мин)
- `POST /api/legacy/sync/disable` — выключить cron-синхронизацию
- `POST /api/legacy/sync/run-now` — запустить синхронизацию вручную

**Frontend компоненты Legacy (`components/legacy/`):**
- `LegacyCustomerPicker` — выбор клиента с поиском и ссылкой на Legacy CRM
- `LegacyProductPicker` — выбор товара с фильтром по категории и статусом наличия
- `LegacyCounterpartyPicker` — выбор компании (контрагента) с ИНН
- `LegacyDealLink` — ссылка на сделку с деталями (сумма, этап, контрагент)
- `LegacyDealsList` — список ссылок на несколько сделок

**Frontend API клиент:** `lib/api/legacy.ts` — все методы + `legacyUrls` для генерации URL

## WebSocket события

- `entity:created`, `entity:updated` — сущности
- `status:changed` — изменение статуса
- `comment:created` — новый комментарий
- `user:assigned` — назначение ответственного
- `task:created`, `task:updated` — user task lifecycle (inbox обновляется через WebSocket, без polling)
- `task:reminder` — напоминание о приближающемся дедлайне задачи (за 1 час)
- `task:overdue` — уведомление о просроченной задаче
- `process:incident` — процесс зависнул (worker retries исчерпаны)
- `ai:classification:ready` — автоклассификация AI завершена (entityId, workspaceId, classification)
- `auth:refresh` (client → server) — обновление JWT без разрыва WebSocket
- `presence:update` — список онлайн-пользователей (usePresenceStore)
