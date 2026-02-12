# Правила для ИИ-агента (Claude)

## Язык общения

**Всегда отвечай на русском языке.** Проект для русскоязычных пользователей.

## Стек технологий

- **Frontend:** Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4, Zustand, @dnd-kit, Tiptap, Socket.IO Client, bpmn-js, dmn-js
- **Backend:** NestJS 11, TypeORM, PostgreSQL 16 (pgvector), Socket.IO, AWS SDK v3 (S3), @camunda8/sdk, OpenAI SDK, Zod
- **BPMN:** Camunda 8 Platform, Zeebe 8.7, BPMN 2.0
- **AI:** Yandex Cloud (YandexGPT + Embeddings), Groq (fallback), pgvector (RAG)
- **Инфраструктура:** Docker Swarm (preprod), Docker Compose (dev), Yandex Object Storage, GitHub Actions CI/CD, Nginx, Let's Encrypt

## Структура проекта

```
stankoff-portal/
├── apps/
│   ├── frontend/              # Next.js 16 (App Router)
│   │   └── src/
│   │       ├── app/           # Страницы (dashboard, workspace, tasks, chat, admin, knowledge-base)
│   │       ├── components/    # 22 категории (ai, bpmn, chat, kanban, entity, rbac, sla, dmn...)
│   │       ├── hooks/         # Custom hooks
│   │       ├── lib/api/       # 28 API клиентов
│   │       ├── store/         # 18 Zustand stores
│   │       └── types/         # Общие типы
│   └── backend/               # NestJS 11
│       └── src/
│           ├── modules/       # 25 модулей (ai, bpmn, chat, rbac, entity, sla, dmn, legacy...)
│           ├── migrations/    # TypeORM миграции
│           └── seed/          # Seed данные (87 реальных сотрудников, 8 секций, 15 workspaces)
├── docs/                      # Техническая документация (см. docs/README.md)
├── keycloak-theme/            # Кастомная тема Keycloak
├── nginx/                     # Конфигурация Nginx
├── scripts/                   # Скрипты (backup, setup)
├── CLAUDE.md                  # ← Этот файл (правила для ИИ)
└── SETUP.md                   # Quick Start для новых разработчиков
```

## Правила разработки

### Принципы

1. **Прагматичная чистая архитектура** — Clean Architecture без догм:
   - Доменный слой без зависимостей от фреймворков
   - Интерфейсы для инфраструктуры (репозитории, внешние сервисы)
   - Не создавай лишних абстракций — усложняй по мере необходимости
   - Проект переедет на микросервисы — учитывай при проектировании модулей

2. **Современные практики:**
   - **KISS, YAGNI, DRY** — пиши минимально необходимый код
   - **TypeScript strict** — минимизируй `any`, используй строгие типы
   - **Immutability** — предпочитай `const`, `readonly`, spread вместо мутаций
   - **Composition over inheritance** — compose функции и компоненты
   - **Fail fast** — валидируй на входе, не маскируй ошибки

3. **Security-first:**
   - Защита от OWASP Top 10 (XSS, SQL injection, CSRF)
   - Валидация всех входных данных (class-validator на backend, Zod на frontend)
   - Никогда не логируй пароли, токены, секреты
   - Используй параметризированные запросы (TypeORM делает это автоматически)

4. **Performance:**
   - Server Components по умолчанию, `'use client'` только когда нужны хуки/браузерные API
   - Ленивая загрузка тяжёлых компонентов (`dynamic(() => import(...), { ssr: false })`)
   - Виртуализация длинных списков
   - Debounce для поиска и фильтрации (300ms)
   - Серверная пагинация вместо загрузки всех данных

5. **Чистый код:**
   - Не добавляй лишнего сверх запроса пользователя
   - Редактируй существующие файлы вместо создания новых
   - Понятные имена переменных и функций (русский контекст домена)
   - Маленькие функции с одной ответственностью

6. **Перезапускай сервисы сам** — после изменений в backend перезапускай сервер, не проси пользователя

### Frontend

- **Server Components по умолчанию**, `'use client'` только для хуков и браузерных API
- Состояние — Zustand stores, стили — Tailwind CSS 4 (без отдельных CSS файлов)
- Компоненты по функциональности: `kanban/`, `entity/`, `bpmn/`, `chat/`, `ai/`, `rbac/`, `ui/`...
- bpmn-js/dmn-js — только через `dynamic(() => import(...), { ssr: false })`
- **API запросы** — только через `apiClient` с относительными путями (`/api/...`):
  - `apiClient.get('/workspaces')` → Next.js rewrites → backend
  - Никогда не `fetch('http://localhost:3001/...')` — ломает cookies
- **Авторизация:** Keycloak SSO (prod/preprod), dev mode с карточками пользователей

### Backend

- Один модуль = одна доменная область
- WebSocket — через EventsGateway
- Валидация — class-validator в DTO
- `synchronize: false` **везде** — только миграции!

### Тестирование (ОБЯЗАТЕЛЬНО)

Весь новый функционал покрыт тестами.

```bash
npm run test              # Unit тесты backend (Jest)
npm run test:coverage     # Покрытие
npm run test:e2e          # E2E (Playwright)
```

**Требования:**
- Каждый сервис — `*.spec.ts` рядом с файлом
- Мокировать внешние зависимости (БД, API, S3)
- Тестировать happy path + error cases
- Строгие типы, минимум `any`

### Проверка после изменений (ОБЯЗАТЕЛЬНО)

```bash
npm run test                          # Unit тесты
cd apps/backend && npm run build      # TypeScript backend
cd apps/frontend && npm run build     # TypeScript frontend
```

### Документирование (ОБЯЗАТЕЛЬНО)

После изменений обновляй:
- **docs/ARCHITECTURE.md** — при изменении модулей, компонентов, stores
- **docs/API.md** — при новых/изменённых endpoints или WebSocket событиях
- **CLAUDE.md** — при изменении стека, структуры, команд

### Миграции БД

```bash
cd apps/backend
npm run migration:generate -- src/migrations/DescriptiveName  # Генерация
npm run migration:run                                          # Применение
npm run migration:revert                                       # Откат
```

**Правила:** идемпотентные миграции, `IF EXISTS`/`IF NOT EXISTS`, GIN индексы вручную, entity + миграция в одном коммите.

**При добавлении нового модуля** — ВСЕГДА добавляй entity в ОБА конфига: `typeorm.config.ts` И `typeorm-cli.config.ts`.

## Окружения

| Окружение | Ветка | Домен | Деплой |
|-----------|-------|-------|--------|
| **Preprod** | `develop` | preprod.stankoff.ru | Автоматический (GitHub Actions → Docker Swarm) |
| **Production** | `main` | bpms.stankoff.ru | Пока отключен |
| **Development** | Любая | localhost:3000 | Локально |

## Keycloak SSO

- **Внешний** Keycloak: `https://new.stankoff.ru/oidc/`, realm `stankoff-preprod`
- Realm `stankoff` — **для другого проекта, НЕ ТРОГАТЬ!**
- Nginx не проксирует `/auth/` — это внешний сервис

## Команды

```bash
# Разработка
npm run dev                # Frontend + Backend
npm run docker:up          # PostgreSQL + pgAdmin
npm run db:seed            # Seed данные

# Camunda (BPMN)
docker compose -f docker-compose.camunda.yml up -d

# Деплой
git push origin develop    # Автодеплой на preprod

# Проверка preprod
curl https://preprod.stankoff.ru/api/health
ssh -l youredik 51.250.117.178 "docker stack services stankoff-preprod"
```

## Подробная документация

| Тема | Файл |
|------|------|
| API Reference + WebSocket | [docs/API.md](docs/API.md) |
| Архитектура системы | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| BPMN техническая | [docs/BPMN.md](docs/BPMN.md) |
| BPMN для менеджеров | [docs/BPMN_USER_GUIDE.md](docs/BPMN_USER_GUIDE.md) |
| CI/CD и деплой | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Инфраструктура | [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) |
| Legacy CRM интеграция | [docs/LEGACY.md](docs/LEGACY.md) |
| Дорожная карта | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Quick Start | [SETUP.md](SETUP.md) |
