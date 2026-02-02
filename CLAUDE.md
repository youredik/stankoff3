# Правила для ИИ-агента (Claude)

## Язык общения

**ВАЖНО:** Всегда отвечай на русском языке. Проект разрабатывается для русскоязычных пользователей.

## Стек технологий

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, @dnd-kit, Tiptap, Socket.IO Client
- **Backend:** NestJS 11, TypeORM, PostgreSQL, Socket.IO, AWS SDK v3 (S3)
- **Инфраструктура:** Docker Compose, Yandex Object Storage

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

1. **Не усложняй** — пиши минимально необходимый код для решения задачи
2. **Не добавляй лишнего** — никаких "улучшений" сверх запроса пользователя
3. **Редактируй существующее** — предпочитай изменение файлов созданию новых
4. **Проверяй работоспособность** — после изменений убедись, что код работает
5. **Всегда документируй** — после любых изменений обновляй документацию
6. **Перезапускай сервисы сам** — после изменений в backend перезапускай сервер самостоятельно, не проси пользователя

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

### Проверка работоспособности (ОБЯЗАТЕЛЬНО)

После любых изменений в коде **всегда** проверяй:

1. **E2E тесты (Playwright):**
   ```bash
   cd apps/frontend && npm run test:e2e
   ```

2. **TypeScript компиляция:**
   ```bash
   cd apps/frontend && npm run build
   cd apps/backend && npm run build
   ```

3. **Что проверять:**
   - E2E тесты проходят
   - Нет ошибок TypeScript
   - Нет runtime ошибок в консоли браузера
   - Нет ошибок 500 от API

4. **При ошибках:**
   - Исправь ошибку
   - Проверь снова
   - Только потом переходи к документированию

### Frontend

- Используй `'use client'` только когда нужны хуки или браузерные API
- Состояние храни в Zustand stores
- Стили — Tailwind CSS классы, без отдельных CSS файлов
- Компоненты размещай по функциональности: `kanban/`, `entity/`, `workspace/`, `layout/`, `ui/`

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
- Текущий режим: **только Keycloak SSO** (локальная авторизация отключена)
- Страница `/login` автоматически редиректит на Keycloak
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

# E2E тесты (Playwright)
cd apps/frontend
npm run test:e2e         # Запуск всех тестов (с автоочисткой)
npm run test:e2e:headed  # Тесты с видимым браузером
npm run test:e2e:ui      # Интерактивный UI для тестов
```

> **Изоляция тестов:** E2E тесты автоматически очищают тестовые данные через `global-setup.ts` и `global-teardown.ts`. Очистка удаляет сущности с маркерами в названии (Playwright, Тест, DnD, и т.д.).

## API

**Авторизация (Keycloak SSO):**
- `GET /api/auth/keycloak/login` — редирект на Keycloak
- `GET /api/auth/keycloak/callback` — callback после авторизации
- `GET /api/auth/me` — текущий пользователь
- `POST /api/auth/refresh` — обновление access token
- `POST /api/auth/logout` — выход (очистка cookies + Keycloak logout URL)

**Основные эндпоинты:**
- `GET/POST /api/entities` — сущности
- `PATCH /api/entities/:id/status` — изменение статуса
- `PATCH /api/entities/:id/assignee` — назначение исполнителя
- `DELETE /api/entities/cleanup/test-data` — очистка тестовых данных (E2E)
- `GET/POST /api/comments/entity/:id` — комментарии
- `GET/POST/PUT /api/workspaces` — рабочие места
- `POST /api/files/upload` — загрузка файлов

## WebSocket события

- `entity:created`, `entity:updated` — сущности
- `status:changed` — изменение статуса
- `comment:created` — новый комментарий
- `user:assigned` — назначение ответственного
