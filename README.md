# Stankoff Portal - Корпоративный портал

Система управления цифровыми рабочими местами с гибкой настройкой сущностей, канбан-досками и real-time обновлениями.

## Стек технологий

### Frontend
- **Next.js 16.1** с App Router и Turbopack
- **React 19.0**
- **TypeScript 5.9**
- **Tailwind CSS 4.0**
- **@dnd-kit** - Drag and Drop для канбана и конструктора
- **Tiptap** - Rich text редактор с @mentions
- **Socket.IO Client** - Real-time WebSocket
- **Zustand** - State Management

### Backend
- **NestJS 11.1**
- **TypeORM 0.3.28**
- **PostgreSQL 18.1**
- **Socket.IO** - WebSocket Gateway
- **AWS SDK v3** - Yandex S3 интеграция
- **class-validator** - Валидация DTO

### Инфраструктура
- **Docker Compose** (PostgreSQL + pgAdmin)
- **Monorepo** с npm workspaces

## Быстрый старт

```bash
# 1. Установка зависимостей
npm install
cd apps/frontend && npm install
cd ../backend && npm install
cd ../..

# 2. Настройка окружения
cp .env.example .env
# Отредактируйте .env файл

# 3. Запуск PostgreSQL
npm run docker:up

# 4. Запуск приложения
npm run dev

# Frontend: http://localhost:3000
# Backend API: http://localhost:3001/api
# pgAdmin: http://localhost:5050
```

## Структура проекта

```
stankoff-portal/
├── apps/
│   ├── frontend/                 # Next.js приложение
│   │   └── src/
│   │       ├── app/              # App Router страницы
│   │       ├── components/
│   │       │   ├── kanban/       # Канбан-доска
│   │       │   ├── entity/       # Компоненты сущностей
│   │       │   ├── workspace/    # Конструктор рабочих мест
│   │       │   ├── layout/       # Header, Sidebar, NotificationPanel
│   │       │   └── ui/           # Переиспользуемые UI компоненты
│   │       ├── hooks/            # useWebSocket и другие хуки
│   │       ├── lib/api/          # API клиент (axios)
│   │       ├── store/            # Zustand stores
│   │       └── types/            # TypeScript типы
│   │
│   └── backend/                  # NestJS приложение
│       └── src/
│           ├── modules/
│           │   ├── workspace/    # Управление рабочими местами
│           │   ├── entity/       # Сущности + комментарии
│           │   ├── user/         # Пользователи
│           │   ├── websocket/    # WebSocket Gateway
│           │   ├── s3/           # Файловое хранилище
│           │   └── auth/         # Авторизация (stub)
│           ├── config/           # TypeORM конфигурация
│           └── seed.service.ts   # Начальные данные
│
├── docker-compose.yml            # PostgreSQL + pgAdmin
├── .env.example                  # Пример переменных окружения
└── docs/                         # Документация
    └── ARCHITECTURE.md           # Архитектура системы
```

## Реализованные функции

### Канбан-доска
- Отображение карточек заявок по статусам
- Drag & Drop перемещение между колонками
- Оптимистичные обновления с rollback при ошибке
- Карточки показывают приоритет, ответственного, связи

### Модальное окно сущности
- Двухколоночный layout (основное содержимое + сайдбар)
- Смена статуса одним кликом
- Выбор ответственного из списка пользователей
- Отображение связанных сущностей

### Комментарии с Rich Text
- **Tiptap** редактор с форматированием (жирный, курсив)
- Вставка ссылок
- **@mentions** пользователей с автокомплитом
- Ctrl+Enter для быстрой отправки

### Real-time обновления (WebSocket)
- Автоматическое обновление при создании/изменении сущностей
- Мгновенные комментарии без перезагрузки
- Toast-уведомления о событиях

### Уведомления
- Панель уведомлений в шапке
- Toast-уведомления при событиях
- Счётчик непрочитанных

### Backend API
```
GET    /api/entities              # Список сущностей
GET    /api/entities/:id          # Детали сущности с комментариями
POST   /api/entities              # Создать сущность
PUT    /api/entities/:id          # Обновить
PATCH  /api/entities/:id/status   # Изменить статус
PATCH  /api/entities/:id/assignee # Назначить ответственного
DELETE /api/entities/:id          # Удалить

GET    /api/comments/entity/:id   # Комментарии сущности
POST   /api/comments/entity/:id   # Добавить комментарий
PUT    /api/comments/:id          # Редактировать
DELETE /api/comments/:id          # Удалить

GET    /api/users                 # Список пользователей
GET    /api/users/:id             # Профиль пользователя

GET    /api/workspaces            # Список рабочих мест
GET    /api/workspaces/:id        # Детали рабочего места
POST   /api/workspaces            # Создать
PUT    /api/workspaces/:id        # Обновить
DELETE /api/workspaces/:id        # Удалить
```

## В разработке

### Конструктор рабочих мест
- Drag & drop настройка полей сущностей
- Поддержка типов: текст, число, дата, выбор, пользователь, файл, связь
- Динамические статусы для колонок канбана

### Фильтрация
- Фильтры по всем полям сущности
- Сохранение фильтров в URL

### Связи сущностей
- Связывание сущностей разных типов
- Отображение данных связанных сущностей

### Вложения файлов
- Загрузка файлов в S3
- Прикрепление к комментариям

## Команды разработки

```bash
# Разработка
npm run dev                # Всё вместе
npm run dev:frontend       # Только frontend
npm run dev:backend        # Только backend

# Сборка
npm run build

# Docker
npm run docker:up          # Запустить PostgreSQL
npm run docker:down        # Остановить
npm run docker:logs        # Логи

# Проверка типов
cd apps/frontend && npx tsc --noEmit
cd apps/backend && npm run build
```

## База данных

### Seed данные
При первом запуске backend автоматически создаёт:
- 1 рабочее место "Техническая поддержка"
- 4 пользователя (admin, manager, 2 employee)
- 4 тестовые заявки

### Подключение к PostgreSQL
```bash
# Через pgAdmin
http://localhost:5050
Email: admin@stankoff.ru
Password: admin

# Через psql
psql -h localhost -p 5432 -U stankoff_admin -d stankoff_portal
```

## Переменные окружения

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=stankoff_portal
DATABASE_USER=stankoff_admin
DATABASE_PASSWORD=stankoff_secret_2026

# Backend
BACKEND_PORT=3001
NODE_ENV=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001

# Yandex S3 (опционально)
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=stankoff-portal-files
```

## Документация

- [SETUP.md](./SETUP.md) - Подробная инструкция установки
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Архитектура системы
- [NEXT_STEPS.md](./NEXT_STEPS.md) - План разработки

## Лицензия

Proprietary - Все права принадлежат Stankoff
