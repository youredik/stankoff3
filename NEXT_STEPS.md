# 📋 Следующие шаги разработки

## ✅ Что уже сделано

### Frontend (Next.js 16)
- ✅ Базовая структура проекта
- ✅ App Router с TypeScript
- ✅ Tailwind CSS 4 настроен
- ✅ Компоненты: Header, Sidebar, NotificationPanel
- ✅ KanbanBoard с @dnd-kit (структура готова)
- ✅ TypeScript типы для всех сущностей
- ✅ Конфигурация для production build

### Backend (NestJS 11)
- ✅ Базовая структура проекта
- ✅ TypeORM 0.3.28 с PostgreSQL 18.1
- ✅ Сущности БД: User, Workspace, Entity, Comment
- ✅ Модуль Workspace (CRUD готов)
- ✅ WebSocket Gateway (структура)
- ✅ S3 модуль для Yandex Object Storage
- ✅ Конфигурация для development

### Инфраструктура
- ✅ Docker Compose с PostgreSQL 18.1 и pgAdmin
- ✅ Monorepo структура
- ✅ Environment variables
- ✅ Документация (README, SETUP)

---

## 🔨 Что нужно доделать

### Приоритет 1: Базовый функционал (1-2 недели)

#### Backend API

**Модуль Entity** (apps/backend/src/modules/entity/)
```typescript
// Создать файлы:
// - entity.service.ts
// - entity.controller.ts
// - dto/create-entity.dto.ts
// - dto/update-entity.dto.ts

// Реализовать endpoints:
// POST   /api/entities - создать сущность
// GET    /api/entities - список сущностей с фильтрами
// GET    /api/entities/:id - одна сущность
// PUT    /api/entities/:id - обновить сущность
// DELETE /api/entities/:id - удалить сущность
// PATCH  /api/entities/:id/status - изменить статус
// PATCH  /api/entities/:id/assignee - назначить ответственного
```

**Модуль Comment**
```typescript
// Создать:
// - comment.service.ts
// - comment.controller.ts

// Endpoints:
// POST   /api/entities/:id/comments - добавить комментарий
// GET    /api/entities/:id/comments - получить комментарии
// PUT    /api/comments/:id - редактировать комментарий
// DELETE /api/comments/:id - удалить комментарий
```

**Модуль User**
```typescript
// Создать:
// - user.service.ts
// - user.controller.ts

// Endpoints:
// GET /api/users - список пользователей
// GET /api/users/:id - профиль пользователя
// PUT /api/users/:id - обновить профиль
```

#### Frontend

**API клиент** (apps/frontend/src/lib/)
```typescript
// Создать файлы:
// - api/client.ts - axios instance
// - api/entities.ts - методы для работ с сущностями
// - api/workspaces.ts - методы для рабочих мест
// - api/users.ts - методы для пользователей
// - api/comments.ts - методы для комментариев
```

**State Management** (apps/frontend/src/store/)
```typescript
// Создать Zustand stores:
// - useEntityStore.ts - состояние сущностей
// - useWorkspaceStore.ts - состояние рабочих мест
// - useUserStore.ts - текущий пользователь
// - useNotificationStore.ts - уведомления
```

**Компоненты**
```typescript
// Создать компоненты:
// - components/entity/EntityModal.tsx - модальное окно сущности
// - components/entity/EntityForm.tsx - форма создания/редактирования
// - components/entity/CommentSection.tsx - секция комментариев
// - components/entity/CommentEditor.tsx - редактор комментариев
// - components/workspace/WorkspaceBuilder.tsx - конструктор рабочих мест
// - components/ui/Button.tsx - переиспользуемые UI компоненты
// - components/ui/Input.tsx
// - components/ui/Modal.tsx
// - components/ui/Select.tsx
```

#### Drag & Drop

**Канбан**
```typescript
// В KanbanBoard.tsx реализовать:
// 1. Обработку drag события
// 2. Обновление статуса через API
// 3. Оптимистичное обновление UI
// 4. Rollback при ошибке
```

### Приоритет 2: Real-time обновления (3-я неделя)

#### WebSocket

**Backend**
```typescript
// apps/backend/src/modules/websocket/events.gateway.ts
// Реализовать:
// 1. Комнаты для разных workspace
// 2. Авторизацию подключений
// 3. События для всех изменений сущностей
// 4. Broadcast обновлений всем подключённым клиентам
```

**Frontend**
```typescript
// apps/frontend/src/hooks/useWebSocket.ts
// Создать hook для:
// 1. Подключения к WebSocket
// 2. Подписки на события
// 3. Автоматического переподключения
// 4. Обработки offline/online

// Интегрировать в компоненты:
// - KanbanBoard - обновление при изменениях
// - EntityModal - обновление комментариев в реальном времени
// - NotificationPanel - новые уведомления
```

### Приоритет 3: Конструктор рабочих мест (4-я неделя)

**Backend**
```typescript
// Доработать Workspace API:
// POST   /api/workspaces - создать рабочее место
// PUT    /api/workspaces/:id - обновить структуру
// POST   /api/workspaces/:id/sections - добавить секцию
// PUT    /api/workspaces/:id/sections/:sectionId - редактировать секцию
// DELETE /api/workspaces/:id/sections/:sectionId - удалить секцию
```

**Frontend**
```typescript
// components/workspace/WorkspaceBuilder.tsx
// Реализовать:
// 1. Drag & drop полей в секции
// 2. Редактирование названий секций и полей
// 3. Настройку опций для select полей
// 4. Настройку валидации (required, min/max)
// 5. Предпросмотр формы
// 6. Сохранение через API
```

### Приоритет 4: Файлы и вложения (5-я неделя)

**S3 Integration**
```typescript
// Backend (apps/backend/src/modules/s3/)
// Доработать:
// 1. Multer middleware для загрузки
// 2. Валидацию файлов (размер, тип)
// 3. Генерацию thumbnail для изображений
// 4. Удаление файлов

// Frontend (apps/frontend/src/components/entity/)
// Создать:
// - FileUploader.tsx - компонент загрузки
// - AttachmentList.tsx - список вложений
// - ImagePreview.tsx - превью изображений

// Интегрировать:
// - В CommentEditor - прикрепление файлов
// - В EntityForm - файловые поля
```

### Приоритет 5: Поиск и фильтры (6-я неделя)

**Backend**
```typescript
// Создать модуль Search:
// GET /api/search?q=query&workspace=id&filters=...
// Реализовать:
// 1. Full-text search по заголовкам и описаниям
// 2. Фильтрацию по полям
// 3. Фильтрацию по дате
// 4. Фильтрацию по ответственному
// 5. Пагинацию результатов
```

**Frontend**
```typescript
// Создать компоненты:
// - components/search/SearchBar.tsx
// - components/search/FilterPanel.tsx
// - components/search/SearchResults.tsx

// Добавить в Header глобальный поиск
// Добавить фильтры в KanbanBoard
```

---

## ✅ Keycloak Integration (ГОТОВО)

Keycloak SSO полностью интегрирован:

### Backend
- ✅ `keycloak.service.ts` — OIDC клиент с openid-client v6
- ✅ PKCE Authorization Code Flow
- ✅ Auto-provisioning пользователей из Keycloak claims
- ✅ Маппинг ролей: admin/realm-admin → admin, manager → manager, остальные → employee
- ✅ Endpoints: `/auth/provider`, `/auth/keycloak/login`, `/auth/keycloak/callback`

### Frontend
- ✅ Страница логина с кнопкой "Войти через SSO"
- ✅ Автоматическое определение провайдера
- ✅ Обработка callback и ошибок SSO

### Инфраструктура
- ✅ Keycloak 26.0 в docker-compose.yml
- ✅ Автоматическая настройка через Keycloak Admin API:
  - Realm: stankoff
  - Client: stankoff-portal (с PKCE)
  - Роли: admin, manager, employee
  - Тестовые пользователи: admin@stankoff.ru, employee@stankoff.ru (пароль: password)

### Как включить
```bash
# 1. Запустить Keycloak
docker compose up -d keycloak

# 2. Установить AUTH_PROVIDER=keycloak в .env

# 3. Перезапустить backend
npm run dev:backend
```

---

## ✅ Автоматизация — ГОТОВО

Система автоматизации позволяет создавать правила, которые выполняются автоматически при определённых событиях.

### Backend
- [x] AutomationRule entity с триггерами, условиями и действиями
- [x] AutomationService для выполнения правил
- [x] Интеграция в EntityService (onCreate, onStatusChange, onAssign)
- [x] API CRUD endpoints (/api/automation)

### Frontend
- [x] AutomationRules.tsx — UI компонент управления правилами
- [x] Вкладка "Автоматизация" в WorkspaceBuilder

### Поддерживаемые триггеры
| Триггер | Описание |
|---------|----------|
| on_create | При создании заявки |
| on_status_change | При изменении статуса |
| on_field_change | При изменении поля |
| on_assign | При назначении исполнителя |
| on_comment | При добавлении комментария |

### Поддерживаемые действия
| Действие | Описание |
|----------|----------|
| set_status | Установить статус |
| set_assignee | Назначить исполнителя |
| set_priority | Установить приоритет |
| set_field | Установить значение поля |
| send_notification | Отправить уведомление в приложении |
| send_email | Отправить email |

### Пример правила
"При создании заявки с высоким приоритетом автоматически назначить на дежурного"
- Триггер: on_create
- Условие: priority equals high
- Действие: set_assignee → ID дежурного

---

## ✅ UI/UX улучшения (9-я неделя) — ГОТОВО

- [x] Анимации переходов (slide-in, fade-in, scale-in в tailwind.config.ts)
- [x] Skeleton loaders (Skeleton.tsx с паттернами SkeletonCard, SkeletonColumn, SkeletonSearchResult)
- [x] Тёмная тема (ThemeToggle, useThemeStore, CSS переменные для dark mode)
- [x] Адаптивная вёрстка для мобильных (burger menu, slide-in sidebar, responsive breakpoints)
- [x] Accessibility (a11y) — aria-labels, aria-expanded, role="dialog", useFocusTrap
- [x] Keyboard shortcuts (Cmd+K для поиска, Escape для закрытия)
- [x] Breadcrumbs навигация (Breadcrumbs.tsx)

---

## ✅ Тестирование (10-я неделя) — ГОТОВО

### Backend
- [x] Unit тесты для сервисов (Jest): UserService, AuthService, EmailService
- [x] Конфигурация Jest в package.json
- [x] E2E тесты с Supertest (test/app.e2e-spec.ts)
- [x] npm run test, npm run test:cov, npm run test:e2e

### Frontend
- [x] Vitest + Testing Library настроен
- [x] Unit тесты для stores: useAuthStore, useEntityStore
- [x] Конфигурация vitest.config.ts
- [x] npm run test, npm run test:watch
- [x] E2E тесты Playwright (уже были)

---

## ✅ Мониторинг и логирование (11-я неделя) — ГОТОВО

- [x] Health check endpoints (/api/health, /api/health/live, /api/health/ready)
- [x] Winston структурированное логирование (JSON в production, цветной вывод в dev)
- [x] Файловое логирование (logs/error.log, logs/combined.log)
- [ ] Sentry (опционально, требует аккаунт)
- [ ] Prometheus metrics (опционально)
- [ ] Grafana dashboards (опционально)

---

## ✅ Деплой (12-я неделя) — ГОТОВО

- [x] Создать production Dockerfile для frontend (apps/frontend/Dockerfile)
- [x] Создать production Dockerfile для backend (apps/backend/Dockerfile)
- [x] Настроить docker-compose.prod.yml
- [x] Настроить CI/CD (GitHub Actions — .github/workflows/ci.yml)
- [x] Настроить reverse proxy (nginx/nginx.conf)
- [x] SSL сертификаты (конфигурация готова, закомментирована)
- [x] Создать backup скрипты для БД (scripts/backup.sh)

### Файлы деплоя:
```
apps/backend/Dockerfile       # Multi-stage build, non-root user, healthcheck
apps/frontend/Dockerfile      # Standalone Next.js, non-root user, healthcheck
docker-compose.prod.yml       # Production compose с nginx, postgres, backend, frontend, backup
nginx/nginx.conf              # Reverse proxy, rate limiting, WebSocket support
.github/workflows/ci.yml      # CI/CD pipeline: lint, test, build, deploy
scripts/backup.sh             # Backup/restore PostgreSQL с поддержкой S3
scripts/Dockerfile.backup     # Cron-сервис для автоматических бэкапов
```

### Запуск в production:
```bash
# 1. Копировать .env.example в .env и настроить
cp .env.example .env

# 2. Запустить все сервисы
docker compose -f docker-compose.prod.yml up -d --build

# 3. Проверить статус
docker compose -f docker-compose.prod.yml ps
curl http://localhost/api/health

# 4. Бэкап базы данных (ручной)
./scripts/backup.sh backup           # Локальный бэкап
./scripts/backup.sh backup-s3        # Бэкап + загрузка в S3
./scripts/backup.sh list-s3          # Список бэкапов в S3
./scripts/backup.sh restore-s3       # Восстановление из S3
```

### Автоматические бэкапы:
- Сервис `backup` в docker-compose.prod.yml запускает бэкапы **раз в час**
- Бэкапы автоматически загружаются в S3 (Yandex Object Storage)
- Старые бэкапы (>7 дней) автоматически удаляются
- Логи: `docker logs stankoff-backup`

### SSL сертификаты (Let's Encrypt):
Домен: **bpms.stankoff.ru**

```bash
# 1. Первичная генерация сертификата
./scripts/init-ssl.sh admin@stankoff.ru

# Тестирование (staging Let's Encrypt):
STAGING=1 ./scripts/init-ssl.sh admin@stankoff.ru
```

**Автопродление:**
- Certbot проверяет сертификаты **каждые 12 часов**
- Nginx перезагружает сертификаты **каждые 6 часов**
- Сертификаты автоматически обновляются за 30 дней до истечения

**Ручное продление:**
```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## 💡 Дополнительные фичи (по желанию)

- [x] Email уведомления (nodemailer, SMTP)
- [x] Экспорт в CSV/JSON (/api/entities/export/csv, /api/entities/export/json)
- [x] Импорт данных из CSV (/api/entities/import/csv, ImportModal.tsx)
- [ ] Экспорт в Excel/PDF
- [ ] Шаблоны сущностей
- [x] Автоматизация (триггеры, правила) — AutomationModule с UI
- [x] Отчёты и аналитика (AnalyticsDashboard)
- [ ] Интеграция с внешними системами
- [ ] Mobile app (React Native)
- [ ] PWA поддержка

---

## 📝 Рекомендации

### Код-ревью
- Делать pull request для каждой фичи
- Ревьюить код перед merge
- Использовать conventional commits
- Покрывать тестами новый код

### Документация
- Обновлять README при добавлении фич
- Документировать API endpoints (Swagger)
- Писать JSDoc для сложных функций
- Создавать диаграммы архитектуры

### Производительность
- Мониторить bundle size frontend
- Оптимизировать SQL запросы
- Использовать индексы в БД
- Кэшировать частые запросы (Redis)

---

## ⏱️ Примерный timeline

| Неделя | Задачи | Результат |
|--------|--------|-----------|
| 1-2 | Backend API + Frontend интеграция | Работающий CRUD для сущностей |
| 3 | WebSocket | Real-time обновления |
| 4 | Конструктор | Создание рабочих мест |
| 5 | Файлы | Загрузка вложений |
| 6 | Поиск | Глобальный поиск и фильтры |
| 7-8 | Keycloak | SSO авторизация |
| 9 | UI polish | Красивый интерфейс |
| 10 | Тесты | Стабильное приложение |
| 11 | Мониторинг | Продакшен-ready |
| 12 | Деплой | Запуск в production |

---

Удачи в разработке! 🚀

При возникновении вопросов - смотри README.md и SETUP.md
