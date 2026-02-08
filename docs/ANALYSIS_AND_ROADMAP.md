# Анализ проекта Stankoff Portal и план развития

**Дата:** Февраль 2026
**Версия:** 2.0 (обновлено 2026-02-08)

---

## 1. Контекст компании Stankoff.ru

### 1.1 О компании

**Станкофф.RU** — крупный дистрибьютор промышленного оборудования в России:
- **Направления:** деревообрабатывающие и металлообрабатывающие станки, промышленное оборудование
- **Ассортимент:** 1144+ моделей оборудования (от настольных до крупных прессов и обрабатывающих центров)
- **Виды оборудования:** гильотинные ножницы, токарные, фрезерные (включая ЧПУ), лазерные, гидропрессы, листогибы и др.
- **География:** вся Россия (Москва, СПб, Казань и др.)
- **Услуги:** продажа, доставка, установка, наладка, запуск, техподдержка, рекламации

### 1.2 Текущая ситуация

| Аспект | Описание |
|--------|----------|
| **Текущая CRM** | Рукописная (legacy), устарела, сложно поддерживать и развивать |
| **Процессы** | Продажи, допродажи, логистика, установка/наладка, техподдержка, рекламации |
| **Рост компании** | Реструктуризация, дробление отделов, появление новых подразделений |
| **Стратегия** | Частичная миграция на новую платформу, приоритет — новые отделы |
| **Приоритетные отделы** | Сервис: техподдержка, рекламации |

### 1.3 Интеграция с legacy-платформой

Новый портал будет взаимодействовать с существующей платформой для получения:
- Сотрудники (пользователи)
- Товарная номенклатура (станки, запчасти)
- Сделки по продажам
- Клиенты и контакты
- Контрагенты
- История обращений (опционально)

---

## 2. Анализ текущего состояния портала

### 2.1 Технологический стек

| Слой | Технологии | Оценка |
|------|-----------|--------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind 4, Zustand, @dnd-kit, Tiptap, Socket.IO, bpmn-js | ✅ Современный |
| **Backend** | NestJS 11, TypeORM, PostgreSQL 16+, Socket.IO, AWS SDK v3, @camunda8/sdk | ✅ Современный |
| **BPMN** | Camunda 8, Zeebe | ✅ Enterprise-grade |
| **Инфраструктура** | Docker Swarm, GitHub Actions, Nginx, Let's Encrypt | ✅ Production-ready |
| **Хранилище** | Yandex Object Storage (S3-compatible) | ✅ Хороший выбор для РФ |
| **Авторизация** | Keycloak SSO | ✅ Enterprise SSO |

**Вердикт:** Стек современный и соответствует best practices 2025-2026.

### 2.2 Реализованные модули

#### Ядро системы
| Модуль | Статус | Описание |
|--------|--------|----------|
| **WorkspaceModule** | ✅ Готов | Конструктор рабочих мест с кастомными полями |
| **EntityModule** | ✅ Готов | Заявки, задачи с динамическими полями |
| **UserModule** | ✅ Готов | Пользователи и роли |
| **AuthModule** | ✅ Готов | JWT + Keycloak SSO |
| **SectionModule** | ✅ Готов | Группировка workspaces в разделы |
| **SearchModule** | ✅ Готов | Full-text search (PostgreSQL tsvector) |

#### Бизнес-процессы (BPMN)
| Модуль | Статус | Описание |
|--------|--------|----------|
| **BpmnModule** | ✅ Готов | Определения и экземпляры процессов |
| **TriggersModule** | ✅ Готов | Автоматический запуск процессов |
| **UserTasksModule** | ✅ Готов | Inbox и обработка задач |
| **EntityLinksModule** | ✅ Готов | Связи между сущностями |
| **ConnectorsModule** | ✅ Базовый | Email, Telegram, REST (для service tasks) |

#### Автоматизация и правила
| Модуль | Статус | Описание |
|--------|--------|----------|
| **AutomationModule** | ✅ Готов | Триггеры и действия по событиям |
| **DmnModule** | ✅ Готов | Таблицы решений (Decision Tables) |
| **SlaModule** | ✅ Готов | Контроль SLA с эскалацией |

#### Вспомогательные
| Модуль | Статус | Описание |
|--------|--------|----------|
| **S3Module** | ✅ Готов | Загрузка файлов с превью |
| **EmailModule** | ✅ Готов | SMTP уведомления |
| **WebsocketModule** | ✅ Готов | Real-time обновления |
| **AuditLogModule** | ✅ Готов | История активности |
| **AnalyticsModule** | ✅ Готов | Materialized views для статистики |

#### ML/AI
| Модуль | Статус | Описание |
|--------|--------|----------|
| **AiModule** | ✅ Готов | LLM классификация, RAG поиск (pgvector), OpenAI/Ollama |
| **RAG Indexer** | ✅ Готов | Индексация legacy заявок, embeddings, семантический поиск |
| **RecommendationsModule** | ✅ Базовый | Статистические рекомендации |

### 2.3 Инфраструктура

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                      │
│  lint → test → build → push to GHCR → deploy via SSH        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Preprod Server (Docker Swarm)                │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  Nginx    │  │ Frontend  │  │  Backend  │               │
│  │  (proxy)  │  │ (Next.js) │  │ (NestJS)  │               │
│  └───────────┘  └───────────┘  └───────────┘               │
│                       │               │                      │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ PostgreSQL│  │   Zeebe   │  │  Certbot  │               │
│  │    16     │  │  (BPMN)   │  │   (SSL)   │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              External Services                               │
│  ┌───────────────┐  ┌─────────────────────┐                │
│  │  Keycloak SSO │  │ Yandex Object Storage│               │
│  │ (new.stankoff)│  │       (S3)          │               │
│  └───────────────┘  └─────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**Особенности:**
- Zero-downtime deployment (start-first strategy)
- Автообновление SSL сертификатов
- Миграции БД автоматически при деплое
- Health checks для всех сервисов

---

## 3. Оценка соответствия best practices

### 3.1 Что сделано хорошо ✅

| Аспект | Реализация |
|--------|------------|
| **Архитектура** | Модульная (NestJS modules), чистое разделение ответственности |
| **API** | RESTful, DTO валидация (class-validator), документированные endpoints |
| **Real-time** | WebSocket для мгновенных обновлений |
| **Авторизация** | Enterprise SSO (Keycloak), RBAC на уровне workspace |
| **БД** | Миграции (TypeORM), synchronize: false везде |
| **Поиск** | PostgreSQL FTS с триггерами (не внешний Elasticsearch) |
| **SLA** | Полноценный модуль с рабочими часами, паузой, эскалацией |
| **BPMN** | Camunda 8 — industry standard |
| **CI/CD** | Автоматический деплой, тесты перед деплоем |
| **Тесты** | Unit-тесты backend, E2E (Playwright) — хотя E2E временно отключены |

### 3.2 Что требует доработки ⚠️

| Аспект | Текущее состояние | Рекомендация |
|--------|-------------------|--------------|
| **ML/AI** | ✅ LLM классификация + RAG поиск реализованы | Расширить: генерация ответов, суммаризация |
| **Интеграция с legacy** | ✅ Read-Only доступ + импорт сотрудников | Готово для текущих нужд |
| **E2E тесты в CI** | Отключены (требуют Keycloak) | Настроить mock-авторизацию |
| **Мониторинг** | Только health checks | Добавить APM (Sentry, Grafana) |
| **Логирование** | Winston (консоль) | Централизованный сбор логов |
| **Масштабирование** | 1 replica каждого сервиса | Подготовить к горизонтальному масштабированию |
| **Резервное копирование** | Каталог /backups есть, но нет автоматизации | Настроить cron backup + offsite |
| **Camunda UI** | Operate/Tasklist не развёрнуты | Опционально добавить для администрирования |

### 3.3 Потенциальные риски ❌

| Риск | Описание | Митигация |
|------|----------|-----------|
| **Единая точка отказа** | 1 сервер для preprod | Подготовить failover или managed k8s |
| **Потеря данных** | Нет проверенного backup/restore | Протестировать восстановление |
| **Keycloak зависимость** | Внешний сервис | Мониторинг доступности |
| **Vendor lock-in (Yandex)** | S3 и возможно сервера | API совместим, миграция возможна |

---

## 4. Gap-анализ для Stankoff.ru

### 4.1 Что есть vs Что нужно

| Потребность | Статус | Комментарий |
|-------------|--------|-------------|
| Рабочие места для отделов | ✅ Есть | WorkspaceBuilder позволяет создавать любые рабочие места |
| Техподдержка | ✅ Готово | Workspace + SLA + триггеры |
| Рекламации | ✅ Готово | Отдельный workspace с процессом |
| Бизнес-процессы | ✅ Готово | Camunda/Zeebe полностью интегрирован |
| Связь между заявками | ✅ Готово | EntityLinks позволяет связывать сущности |
| **Интеграция с legacy CRM** | ✅ Готово | Read-Only: клиенты, товары, контрагенты, сотрудники |
| **Номенклатура товаров** | ✅ Через legacy | LegacyProductPicker + поиск по каталогу |
| **Клиенты/Контрагенты** | ✅ Через legacy | LegacyCustomerPicker + LegacyCounterpartyPicker |
| **Интеллектуальный ИИ** | ✅ Готово | LLM классификация + RAG поиск по legacy заявкам |

### 4.2 Данные для интеграции с Legacy (Read-Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Legacy CRM (MariaDB, stankoff)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  SS_customers   │  │   SS_products   │  │   counterparty  │             │
│  │  (308K+ записей)│  │  (товары)       │  │  (юр. лица)     │             │
│  │  customerID     │  │  productID      │  │  id, inn, name  │             │
│  │  first_name     │  │  name, uri      │  │  dadata_*       │             │
│  │  last_name      │  │  Price          │  │                 │             │
│  │  Email, phone   │  │  categoryID     │  │                 │             │
│  │  is_manager     │  │  in_stock       │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴────────┐              │
│  │  QD_requests    │  │  SS_categories  │  │     deal       │              │
│  │  (обращения)    │  │  (категории)    │  │  (сделки)      │              │
│  │  RID, subject   │  │  categoryID     │  │  id, sum       │              │
│  │  type, closed   │  │  name, uri      │  │  deal_stage_id │              │
│  │  customerID     │  │  parent         │  │  counterparty  │              │
│  └─────────────────┘  └─────────────────┘  └────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │    READ-ONLY SQL QUERIES      │
                    │    (TypeORM второй DataSource)│
                    └───────────────┬───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Stankoff Portal (PostgreSQL)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                     entities (заявки)                            │       │
│  │  • legacy_customer_id → SS_customers.customerID                 │       │
│  │  • legacy_product_id → SS_products.productID                    │       │
│  │  • legacy_deal_id → deal.id                                     │       │
│  │  • legacy_counterparty_id → counterparty.id                     │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Workspace   │  │    BPMN      │  │     SLA      │  │    AI/ML     │   │
│  │  Техподдержка│  │  Процессы    │  │  Контроль    │  │  RAG Search  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Преимущества Read-Only подхода:**
- Нет риска повредить данные legacy
- Не нужен API на стороне legacy
- Быстрый доступ (прямые SQL запросы)
- Можно кэшировать часто запрашиваемые данные

---

## 5. План развития (Roadmap)

### Фаза 1: Интеграция с Legacy CRM ✅ DONE

#### 1.1 Анализ Legacy системы

**Технологии legacy:**
- PHP 8.1+ с Smarty шаблонизатором
- MariaDB/MySQL (405 таблиц)
- FastRoute для маршрутизации
- ADODB для работы с БД

**Подход интеграции:** Прямой Read-Only доступ к БД legacy (не API)

#### 1.2 Ключевые таблицы для интеграции

##### Клиенты и Контакты
| Таблица | Описание | Ключевые поля |
|---------|----------|---------------|
| `SS_customers` | Пользователи (клиенты + сотрудники) | `customerID`, `first_name`, `last_name`, `Email`, `phone`, `is_manager` |
| `user_phone` | Телефоны пользователей | `user_id`, `phone`, `is_default` |
| `user_email` | Email пользователей | `user_id`, `email`, `is_default` |
| `counterparty` | Контрагенты (юр. лица) | `id`, `name`, `inn`, `dadata_*` |

##### Товары и Каталог
| Таблица | Описание | Ключевые поля |
|---------|----------|---------------|
| `SS_products` | Товары | `productID`, `name`, `uri`, `Price`, `categoryID`, `in_stock` |
| `SS_categories` | Категории | `categoryID`, `name`, `uri`, `parent` |
| `SS_producer` | Производители | `producerID`, `producer_name`, `producer_country` |
| `SS_product_pictures` | Фото товаров | `photoID`, `productID`, `filename`, `thumbnail` |

##### Обращения (уже есть в legacy!)
| Таблица | Описание | Ключевые поля |
|---------|----------|---------------|
| `QD_requests` | Обращения | `RID`, `customerID`, `manager_id`, `subject`, `type`, `closed` |
| `QD_answers` | Ответы | `AID`, `RID`, `customerID`, `answer`, `add_date` |
| `QD_attaches` | Вложения | `attID`, `AID`, `filename`, `type` |
| `QD_statuses` | Статусы | `id`, `name`, `color` |

##### Сделки и Заказы
| Таблица | Описание | Ключевые поля |
|---------|----------|---------------|
| `deal` | Сделки CRM | `id`, `counterparty_id`, `employee_user_id`, `sum`, `deal_stage_id` |
| `deal_stage` | Этапы воронки | `id`, `funnel_id`, `name`, `order` |
| `lead` | Лиды | `id`, `counterparty_id`, `source`, `lead_stage_id` |
| `SS_orders` | Заказы | `orderID`, `customerID`, `order_amount`, `statusID` |

##### Вспомогательные
| Таблица | Описание |
|---------|----------|
| `task` | Задачи сотрудников |
| `geo_country` | Страны |
| `SS_customer_roles` | Роли пользователей |

#### 1.3 Структура модуля интеграции

```
LegacyModule/
├── legacy.module.ts
├── config/
│   └── legacy-db.config.ts        # TypeORM config для второй БД
├── entities/                       # Read-only сущности
│   ├── legacy-customer.entity.ts
│   ├── legacy-product.entity.ts
│   ├── legacy-counterparty.entity.ts
│   ├── legacy-deal.entity.ts
│   └── legacy-request.entity.ts
├── repositories/                   # Read-only репозитории
│   ├── legacy-customer.repository.ts
│   ├── legacy-product.repository.ts
│   └── legacy-deal.repository.ts
├── services/
│   ├── legacy-search.service.ts   # Поиск по legacy данным
│   ├── legacy-sync.service.ts     # Кэширование/синхронизация
│   └── legacy-mapper.service.ts   # Маппинг legacy → portal
├── dto/
│   ├── legacy-customer.dto.ts
│   └── legacy-product.dto.ts
└── controllers/
    └── legacy.controller.ts        # API для frontend
```

#### 1.4 Конфигурация подключения к legacy БД

```typescript
// apps/backend/src/config/legacy-database.config.ts
import { DataSourceOptions } from 'typeorm';

export const legacyDatabaseConfig: DataSourceOptions = {
  name: 'legacy',
  type: 'mysql',                    // MariaDB совместим
  host: process.env.LEGACY_DB_HOST,
  port: parseInt(process.env.LEGACY_DB_PORT || '3306'),
  username: process.env.LEGACY_DB_USER,
  password: process.env.LEGACY_DB_PASSWORD,
  database: process.env.LEGACY_DB_NAME || 'stankoff',
  entities: [__dirname + '/../modules/legacy/entities/*.entity{.ts,.js}'],
  synchronize: false,               // НИКОГДА не синхронизировать!
  logging: process.env.NODE_ENV === 'development',
  extra: {
    connectionLimit: 5,             // Ограничиваем нагрузку
  },
};
```

#### 1.5 Пример entity для legacy таблицы

```typescript
// legacy-customer.entity.ts
import { Entity, Column, PrimaryColumn, ViewEntity } from 'typeorm';

@Entity('SS_customers', { database: 'legacy' })
export class LegacyCustomer {
  @PrimaryColumn({ name: 'customerID' })
  id: number;

  @Column({ name: 'first_name', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string;

  @Column({ name: 'Email', nullable: true })
  email: string;

  @Column({ type: 'decimal', precision: 20, scale: 0 })
  phone: string;

  @Column({ name: 'is_manager', default: 0 })
  isManager: boolean;

  @Column({ name: 'default_counterparty_id', default: 0 })
  defaultCounterpartyId: number;

  // Computed property
  get displayName(): string {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim() || this.email;
  }
}

// legacy-product.entity.ts
@Entity('SS_products', { database: 'legacy' })
export class LegacyProduct {
  @PrimaryColumn({ name: 'productID' })
  id: number;

  @Column()
  name: string;

  @Column()
  uri: string;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  Price: number;

  @Column({ name: 'categoryID' })
  categoryId: number;

  @Column({ name: 'in_stock', default: 0 })
  inStock: number;

  @Column({ name: 'product_code', nullable: true })
  productCode: string;

  @Column({ name: 'factory_name', nullable: true })
  factoryName: string;
}
```

#### 1.6 API endpoints для интеграции

```typescript
// API для поиска в legacy
GET /api/legacy/customers/search?q=текст&limit=10
GET /api/legacy/customers/:id
GET /api/legacy/counterparties/search?q=текст
GET /api/legacy/counterparties/:id

GET /api/legacy/products/search?q=текст&categoryId=123
GET /api/legacy/products/:id
GET /api/legacy/categories

GET /api/legacy/deals?counterpartyId=123
GET /api/legacy/deals/:id
GET /api/legacy/requests?customerId=123
```

#### 1.7 Расширение сущностей портала

```typescript
// Добавить в Entity портала
@Column({ name: 'legacy_customer_id', nullable: true })
legacyCustomerId: number;

@Column({ name: 'legacy_product_id', nullable: true })
legacyProductId: number;

@Column({ name: 'legacy_deal_id', nullable: true })
legacyDealId: number;

@Column({ name: 'legacy_request_id', nullable: true })
legacyRequestId: number;  // Для миграции старых обращений
```

#### 1.8 UI компоненты для выбора из legacy

```typescript
// Frontend компоненты
<LegacyCustomerPicker
  value={selectedCustomerId}
  onChange={(id) => setCustomerId(id)}
  placeholder="Найти клиента..."
/>

<LegacyProductPicker
  value={selectedProductId}
  onChange={(id) => setProductId(id)}
  categoryFilter={categoryId}
/>

<LegacyDealLink dealId={entity.legacyDealId} />
```

#### 1.9 Переменные окружения

```bash
# .env.preprod (добавить)

# Legacy Database (Read-Only!)
LEGACY_DB_HOST=your-legacy-db-host
LEGACY_DB_PORT=3306
LEGACY_DB_USER=stankoff_portal_readonly
LEGACY_DB_PASSWORD=your-secure-password
LEGACY_DB_NAME=stankoff

# Важно: создать пользователя с ТОЛЬКО SELECT правами!
# CREATE USER 'stankoff_portal_readonly'@'%' IDENTIFIED BY 'password';
# GRANT SELECT ON stankoff.SS_customers TO 'stankoff_portal_readonly'@'%';
# GRANT SELECT ON stankoff.SS_products TO 'stankoff_portal_readonly'@'%';
# ... и т.д. для нужных таблиц
```

#### 1.10 План миграции данных

| Этап | Данные | Действие |
|------|--------|----------|
| 1 | Клиенты | Read-only из legacy, кэш в Redis |
| 2 | Товары | Read-only, кэш категорий |
| 3 | Обращения | Импорт истории для RAG/AI |
| 4 | Сделки | Связь по ID для контекста |

#### 1.11 Задачи интеграции

- [x] Создать read-only пользователя в legacy БД
- [x] Настроить второй DataSource в NestJS (MySQL/MariaDB)
- [x] Создать entities для ключевых таблиц (customers, products, categories, counterparties, deals, managers, departments)
- [x] Реализовать поиск клиентов/товаров/контрагентов
- [x] Добавить UI-пикеры на frontend (5 компонентов в `components/legacy/`)
- [x] Импорт сотрудников в Keycloak (87 активных)
- [x] Протестировать на preprod с реальными данными
- [ ] Настроить кэширование (Redis или in-memory) — при необходимости

### Фаза 2: ИИ-ассистент и LLM интеграция (частично ✅)

#### 2.1 Структура AI модуля
```
AiModule/
├── ai.module.ts
├── config/
│   └── ai.config.ts               # Конфигурация провайдеров
├── providers/
│   ├── base-llm.provider.ts       # Абстрактный провайдер
│   ├── openai.provider.ts         # OpenAI GPT-4o
│   ├── anthropic.provider.ts      # Claude 3.5 Sonnet
│   ├── yandex-gpt.provider.ts     # YandexGPT (резерв для РФ)
│   └── gigachat.provider.ts       # GigaChat (резерв для РФ)
├── embeddings/
│   ├── embeddings.service.ts      # Генерация embeddings
│   └── pgvector.repository.ts     # Хранение в PostgreSQL
├── services/
│   ├── ai-orchestrator.service.ts # Маршрутизация запросов
│   ├── entity-classifier.service.ts
│   ├── response-generator.service.ts
│   ├── summarizer.service.ts
│   ├── knowledge-base.service.ts
│   ├── chat-assistant.service.ts
│   └── translation.service.ts
├── workers/
│   ├── embedding-worker.ts        # Background индексация
│   └── classification-worker.ts   # Async классификация
├── prompts/
│   ├── classification.prompt.ts
│   ├── response-draft.prompt.ts
│   ├── summarization.prompt.ts
│   └── rag-query.prompt.ts
└── dto/
    ├── ai-request.dto.ts
    └── ai-response.dto.ts
```

#### 2.2 Выбор LLM провайдера

| Провайдер | Модель | Использование | Преимущества |
|-----------|--------|---------------|--------------|
| **OpenAI** | GPT-4o | Основной | Лучшее качество, быстрый |
| **Anthropic** | Claude 3.5 Sonnet | Backup | Большой контекст (200K), хорош для RAG |
| **YandexGPT** | YandexGPT Pro | РФ fallback | Локализация, без проблем с блокировками |
| **GigaChat** | GigaChat Pro | РФ fallback | Альтернатива Yandex |

**Рекомендуемая стратегия:**
1. **Primary:** OpenAI GPT-4o (для качества)
2. **Fallback:** Anthropic Claude (при проблемах с OpenAI)
3. **РФ backup:** YandexGPT (если внешние API недоступны)

#### 2.3 Полный список сценариев использования ИИ

##### Обработка заявок (Entity Processing)
| Сценарий | Триггер | Действие | Приоритет |
|----------|---------|----------|-----------|
| **Автоклассификация** | Создание заявки | Определить тип, категорию, приоритет | P0 |
| **Автоназначение** | Создание заявки | Рекомендовать исполнителя на основе контента | P0 |
| **Определение срочности** | Создание заявки | Анализ тональности и ключевых слов | P0 |
| **Дедупликация** | Создание заявки | Поиск похожих/дублирующих заявок | P1 |
| **Обогащение данных** | Создание заявки | Извлечь серийный номер, модель оборудования | P1 |

##### Помощь оператору (Operator Assistant)
| Сценарий | Триггер | Действие | Приоритет |
|----------|---------|----------|-----------|
| **Генерация ответа** | Кнопка "Предложить ответ" | Черновик на основе контекста и FAQ | P0 |
| **Поиск решений** | Кнопка "Найти решение" | RAG поиск по базе закрытых заявок | P0 |
| **Суммаризация** | Кнопка "Краткое изложение" | Сжатие длинной переписки | P1 |
| **Перевод** | Заявка на иностранном языке | Перевод на русский + ответ обратно | P2 |
| **Чек-лист диагностики** | Тип заявки "Диагностика" | Сгенерировать вопросы для клиента | P1 |

##### Аналитика и отчёты (Analytics)
| Сценарий | Триггер | Действие | Приоритет |
|----------|---------|----------|-----------|
| **Анализ трендов** | Ежедневно/еженедельно | Выявить частые проблемы | P2 |
| **Sentiment анализ** | По комментариям | Определить удовлетворённость клиента | P2 |
| **Выявление аномалий** | Real-time | Резкий рост заявок по теме | P1 |
| **Отчёт по качеству** | Еженедельно | Анализ решённых заявок | P2 |

##### Автоматизация процессов (BPMN + AI)
| Сценарий | Триггер | Действие | Приоритет |
|----------|---------|----------|-----------|
| **AI Gateway** | Service Task в BPMN | LLM принимает решение в процессе | P1 |
| **Условная маршрутизация** | Exclusive Gateway | AI определяет ветку процесса | P1 |
| **Автозакрытие** | Нет ответа 7 дней | AI оценивает можно ли закрыть | P2 |
| **Эскалация по тональности** | Негативный комментарий | Автоэскалация на менеджера | P1 |

##### Клиентский портал (будущее)
| Сценарий | Триггер | Действие | Приоритет |
|----------|---------|----------|-----------|
| **Чат-бот** | Обращение клиента | Первичная обработка, FAQ | P3 |
| **Статус заявки** | Вопрос клиента | Информирование о статусе | P3 |
| **Создание заявки через чат** | Диалог с клиентом | Сбор информации, создание entity | P3 |

#### 2.4 Архитектура RAG (Retrieval-Augmented Generation)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         KNOWLEDGE BASE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │   Закрытые   │  │ Документация │  │     FAQ      │  │  Инструкции  ││
│  │   заявки     │  │ оборудования │  │  и ответы    │  │  и мануалы   ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │      INDEXING PIPELINE        │
                    │                               │
                    │  1. Chunking (512 tokens)     │
                    │  2. Embedding (text-embedding-│
                    │     3-large или e5-large)     │
                    │  3. Store in pgvector         │
                    │  4. Metadata indexing         │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL + PGVECTOR                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  knowledge_chunks                                                │   │
│  │  ─────────────────                                               │   │
│  │  id | content | embedding (vector(1536)) | source_type |         │   │
│  │  source_id | metadata | created_at                               │   │
│  │                                                                   │   │
│  │  INDEX: embedding vector_cosine_ops (HNSW for speed)             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │      RETRIEVAL PIPELINE       │
                    │                               │
                    │  1. User query → embedding    │
                    │  2. Similarity search (top-k) │
                    │  3. Re-ranking (optional)     │
                    │  4. Context assembly          │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM GENERATION                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  SYSTEM PROMPT:                                                  │   │
│  │  "Ты помощник оператора техподдержки Станкофф.RU.               │   │
│  │   Используй предоставленный контекст для ответа.                 │   │
│  │   Всегда указывай источник информации."                          │   │
│  │                                                                   │   │
│  │  CONTEXT: [retrieved chunks with sources]                        │   │
│  │                                                                   │   │
│  │  USER QUERY: "Как настроить ЧПУ на станке XYZ-500?"             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  RESPONSE:                                                       │   │
│  │  "Для настройки ЧПУ на станке XYZ-500 выполните следующее:      │   │
│  │   1. Включите станок...                                          │   │
│  │   2. Откройте меню настроек...                                   │   │
│  │                                                                   │   │
│  │   Источники:                                                     │   │
│  │   - Заявка TP-1234 (решена 15.01.2026)                          │   │
│  │   - Инструкция XYZ-500, стр. 45"                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2.5 Интеграция AI в UI

##### Компоненты Frontend
```typescript
// AI-компоненты для EntityDetailPanel

// 1. Кнопка генерации ответа
<AiSuggestButton
  entityId={entity.id}
  onSuggestion={(draft) => setCommentDraft(draft)}
/>

// 2. Виджет похожих заявок
<SimilarEntitiesWidget
  title={entity.title}
  description={entity.description}
  workspaceId={entity.workspaceId}
/>

// 3. AI-ассистент (sidebar chat)
<AiAssistantPanel
  context={{ entity, comments, workspace }}
  onAction={(action) => handleAiAction(action)}
/>

// 4. Авто-заполнение полей
<AiAutoFillBadge
  field="priority"
  suggestedValue="high"
  confidence={0.87}
  onApply={() => updatePriority('high')}
/>
```

##### API Endpoints для AI
```typescript
// AI endpoints (добавить в backend)

// Классификация
POST /api/ai/classify
Body: { title, description, workspaceId }
Response: { category, priority, confidence, suggestedAssignee }

// Генерация ответа
POST /api/ai/generate-response
Body: { entityId, context?: string }
Response: { draft: string, sources: Source[] }

// RAG поиск
POST /api/ai/search
Body: { query, workspaceId?, filters?: { sourceType, dateRange } }
Response: { results: ChunkWithScore[], generatedAnswer?: string }

// Суммаризация
POST /api/ai/summarize
Body: { entityId } | { text: string }
Response: { summary: string, keyPoints: string[] }

// Чат с ассистентом
POST /api/ai/chat
Body: { message, sessionId?, context?: { entityId, workspaceId } }
Response: { response: string, actions?: SuggestedAction[] }
```

#### 2.6 Настройка pgvector для RAG

```sql
-- Миграция для pgvector
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(1536),  -- для OpenAI embeddings
  source_type VARCHAR(50) NOT NULL,  -- 'entity', 'comment', 'document', 'faq'
  source_id UUID,
  workspace_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- HNSW индекс для быстрого поиска
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Индекс по workspace для фильтрации
CREATE INDEX idx_chunks_workspace ON knowledge_chunks(workspace_id);
CREATE INDEX idx_chunks_source ON knowledge_chunks(source_type, source_id);

-- Функция поиска похожих
CREATE OR REPLACE FUNCTION search_similar_chunks(
  query_embedding vector(1536),
  workspace_filter UUID DEFAULT NULL,
  source_filter VARCHAR(50) DEFAULT NULL,
  limit_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type VARCHAR(50),
  source_id UUID,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.source_type,
    kc.source_id,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  FROM knowledge_chunks kc
  WHERE
    (workspace_filter IS NULL OR kc.workspace_id = workspace_filter)
    AND (source_filter IS NULL OR kc.source_type = source_filter)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

#### 2.7 Конфигурация и переменные окружения

```bash
# .env.preprod (добавить)

# AI Configuration
AI_ENABLED=true
AI_PRIMARY_PROVIDER=openai
AI_FALLBACK_PROVIDER=anthropic

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# Anthropic (backup)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# YandexGPT (РФ fallback)
YANDEX_GPT_API_KEY=...
YANDEX_GPT_FOLDER_ID=...

# RAG Settings
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
RAG_TOP_K=5
RAG_MIN_SIMILARITY=0.7

# AI Limits (для контроля расходов)
AI_DAILY_TOKEN_LIMIT=1000000
AI_REQUEST_TIMEOUT_MS=30000
```

#### 2.8 Примеры использования в BPMN

```xml
<!-- AI Service Task в BPMN процессе -->
<bpmn:serviceTask id="classifyTicket" name="AI Классификация">
  <bpmn:extensionElements>
    <zeebe:taskDefinition type="ai:classify" />
    <zeebe:ioMapping>
      <zeebe:input source="=entity.title" target="title" />
      <zeebe:input source="=entity.description" target="description" />
      <zeebe:output source="=category" target="classifiedCategory" />
      <zeebe:output source="=priority" target="suggestedPriority" />
      <zeebe:output source="=confidence" target="aiConfidence" />
    </zeebe:ioMapping>
  </bpmn:extensionElements>
</bpmn:serviceTask>

<!-- Условная маршрутизация по AI -->
<bpmn:exclusiveGateway id="routeByAi" name="Маршрутизация">
  <bpmn:incoming>classifyTicket</bpmn:incoming>
  <bpmn:outgoing>toSupport</bpmn:outgoing>
  <bpmn:outgoing>toReclamation</bpmn:outgoing>
  <bpmn:outgoing>toSales</bpmn:outgoing>
</bpmn:exclusiveGateway>

<bpmn:sequenceFlow id="toReclamation" sourceRef="routeByAi" targetRef="reclamationTask">
  <bpmn:conditionExpression>=classifiedCategory = "reclamation" and aiConfidence > 0.8</bpmn:conditionExpression>
</bpmn:sequenceFlow>
```

#### 2.9 План внедрения AI

| Неделя | Задачи | Статус |
|--------|--------|--------|
| 1 | Настройка pgvector, создание миграции, базовый AiModule | ✅ |
| 2 | Интеграция OpenAI API, классификация заявок | ✅ |
| 3 | RAG: индексация legacy заявок, поиск похожих | ✅ |
| 4 | UI компоненты: кнопка генерации ответа, похожие заявки | ⬜ |
| 5 | AI Service Tasks для BPMN (classify-entity worker) | ✅ |
| 6 | Тестирование, настройка промптов, оптимизация | ⬜ |
| 7 | Мониторинг расходов, fallback провайдеры (Ollama добавлен) | Частично |
| 8 | Обучение операторов, документация | ⬜ |

**Реализовано:**
- AiModule с OpenAI + Ollama (локальные модели)
- Классификация заявок (категория, приоритет, навыки)
- RAG поиск по legacy заявкам (pgvector + embeddings)
- Индексатор legacy данных (QD_requests + QD_answers)
- BPMN worker `classify-entity`
- Health check и статистика

#### 2.10 Примеры промптов

```typescript
// prompts/classification.prompt.ts
export const CLASSIFICATION_PROMPT = `
Ты классификатор заявок техподдержки компании Станкофф.RU (промышленное оборудование).

Проанализируй заявку и определи:
1. Категорию: technical_support | reclamation | consultation | spare_parts | installation | other
2. Приоритет: critical | high | medium | low
3. Требуемые навыки: mechanical | electrical | software | logistics

Признаки критичности:
- Оборудование полностью не работает
- Производство остановлено
- Есть угроза безопасности
- Дедлайн по контракту

Заявка:
Тема: {title}
Описание: {description}
Оборудование: {equipment}

Ответь в JSON формате:
{
  "category": "...",
  "priority": "...",
  "skills": ["..."],
  "confidence": 0.0-1.0,
  "reasoning": "краткое объяснение"
}
`;

// prompts/response-draft.prompt.ts
export const RESPONSE_DRAFT_PROMPT = `
Ты помощник оператора техподдержки Станкофф.RU.

Контекст заявки:
- Тема: {title}
- Описание: {description}
- Предыдущие комментарии: {comments}

Похожие решённые заявки:
{similar_cases}

Задача: Сгенерируй профессиональный черновик ответа клиенту.

Правила:
1. Обращайся на "Вы"
2. Если проблема решена в похожих заявках - предложи решение
3. Если нужна дополнительная информация - вежливо запроси
4. Укажи примерные сроки решения если возможно
5. Подпись не добавляй (оператор добавит сам)

Черновик:
`;

// prompts/summarization.prompt.ts
export const SUMMARIZATION_PROMPT = `
Создай краткое резюме переписки по заявке техподдержки.

Переписка:
{conversation}

Формат ответа:
1. Суть проблемы (1-2 предложения)
2. Текущий статус
3. Ключевые действия, которые были предприняты
4. Что требуется для решения

Резюме:
`;
```

#### 2.11 Мониторинг и аналитика AI

```typescript
// Таблица для логирования AI запросов
interface AiUsageLog {
  id: string;
  provider: 'openai' | 'anthropic' | 'yandex';
  model: string;
  operation: 'classify' | 'generate' | 'embed' | 'search' | 'chat';
  userId: string;
  workspaceId: string;
  entityId?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  createdAt: Date;
}

// Dashboard метрики
interface AiDashboardMetrics {
  // Использование
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;

  // Качество
  classificationAccuracy: number;  // по фидбеку операторов
  responseAcceptanceRate: number;  // сколько черновиков приняли
  ragRelevanceScore: number;       // оценка релевантности

  // Производительность
  avgLatency: number;
  p95Latency: number;
  errorRate: number;

  // По операциям
  byOperation: Record<string, {
    count: number;
    avgLatency: number;
    successRate: number;
  }>;
}
```

**Дашборд AI в админке:**
- Расход токенов по дням/провайдерам
- Стоимость (расчётная по прайсам)
- Топ пользователей по использованию
- Качество: принятые ответы vs отклонённые
- Алерты при превышении лимитов

### Фаза 3: Расширение функционала (2-3 месяца)

#### 3.1 Новые модули
| Модуль | Описание |
|--------|----------|
| **ProductsModule** | Каталог товаров с синхронизацией |
| **CustomersModule** | База клиентов и контактов |
| **KnowledgeBaseModule** | Wiki для документации |
| **ReportsModule** | Расширенные отчёты (PDF, Excel) |
| **NotificationsModule** | Push, Email, Telegram уведомления |

#### 3.2 Улучшения существующих модулей
- **SLA:** Интеграция с рабочим календарём компании
- **BPMN:** Готовые шаблоны процессов для Сервиса
- **Analytics:** Расширенные дашборды по KPI сервиса
- **Search:** Поиск с фильтрами по товарам/клиентам

### Фаза 4: Масштабирование (3+ месяцев)

#### 4.1 Production окружение
- [ ] Отдельный production сервер или Managed Kubernetes
- [ ] Репликация PostgreSQL (primary + replica)
- [ ] Redis для сессий и кэширования
- [ ] Централизованное логирование (ELK / Loki)
- [ ] APM (Sentry / Datadog)
- [ ] Автоматический backup с тестированием restore

#### 4.2 Дополнительные отделы
После стабилизации Сервиса — расширение на другие отделы:
- Продажи
- Логистика
- Установка/Наладка
- Бухгалтерия (интеграция)

---

## 6. Архитектура целевого решения

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           STANKOFF PORTAL 2.0                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         FRONTEND LAYER                           │   │
│  │  Next.js 16 + React 19 + TypeScript + Tailwind CSS               │   │
│  │  • Kanban Board           • BPMN Editor        • AI Assistant    │   │
│  │  • Workspace Builder      • Analytics          • Reports         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                         REST API / WebSocket                             │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND LAYER                            │   │
│  │  NestJS 11 + TypeORM + PostgreSQL                                │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │   Core      │  │  Business   │  │   AI/ML     │              │   │
│  │  │ ─────────── │  │ ─────────── │  │ ─────────── │              │   │
│  │  │ Auth        │  │ BPMN        │  │ Classifier  │              │   │
│  │  │ Users       │  │ Automation  │  │ RAG Engine  │              │   │
│  │  │ Workspaces  │  │ SLA         │  │ Recommender │              │   │
│  │  │ Entities    │  │ DMN         │  │ Summarizer  │              │   │
│  │  │ Search      │  │ Connectors  │  │             │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  │                                                                   │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │                    INTEGRATION LAYER                     │    │   │
│  │  │  • Legacy CRM Adapter  • Products Sync  • Customers Sync │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       DATA LAYER                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │   │
│  │  │PostgreSQL│  │  Zeebe   │  │ pgvector │  │   S3     │        │   │
│  │  │  (main)  │  │  (BPMN)  │  │  (RAG)   │  │ (files)  │        │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                        EXTERNAL SERVICES                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  Keycloak    │  │  Legacy CRM  │  │  OpenAI API  │                  │
│  │    (SSO)     │  │    (sync)    │  │   (LLM)      │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Рекомендации по приоритетам

### Критичные (делать первыми)

1. ~~**Интеграция с legacy CRM**~~ ✅ Реализовано (фазы 1-3)
2. **Настройка backup** — защита от потери данных
3. **Мониторинг и алерты** — видимость проблем

### Высокий приоритет

4. ~~**ИИ-классификация заявок**~~ ✅ Реализовано
5. ~~**RAG для поиска решений**~~ ✅ Реализовано (pgvector + legacy индексация)
6. **Готовые процессы для Сервиса** — шаблоны для типовых сценариев

### Средний приоритет

7. **Расширенная аналитика** — KPI для руководства
8. **Чат-помощник** — для операторов
9. **Push-уведомления** — Telegram бот для срочных

### Низкий приоритет (на будущее)

10. **Клиентский портал** — self-service для клиентов
11. **Мобильное приложение** — для выездных инженеров
12. **Kubernetes миграция** — при росте нагрузки

---

## 8. Метрики успеха

| Метрика | Текущее | Цель | Срок |
|---------|---------|------|------|
| Время первого ответа | Не измеряется | < 2 часов | 3 мес |
| Время решения заявки | Не измеряется | < 24 часов | 3 мес |
| SLA compliance | — | > 90% | 6 мес |
| Использование ИИ-рекомендаций | 0% | > 50% | 6 мес |
| Количество автоматизированных процессов | 0 | > 10 | 6 мес |
| Удовлетворённость операторов | — | > 4.0/5.0 | 6 мес |

---

## 9. Заключение

**Stankoff Portal** имеет отличную техническую базу:
- Современный стек (Next.js 16, NestJS 11, Camunda 8)
- Гибкая архитектура (конструктор рабочих мест)
- Production-ready инфраструктура (Docker Swarm, CI/CD)
- Enterprise SSO (Keycloak)

**Главные задачи для достижения целей:**
1. Интеграция с legacy-системой для получения контекста (клиенты, товары)
2. Добавление LLM для интеллектуальной помощи операторам
3. Создание готовых процессов для отдела Сервиса

Платформа готова к постепенной миграции отделов с минимальными рисками.

---

## Источники

- [Станкофф.RU - Официальный сайт](https://www.stankoff.ru/)
- [О компании](https://www.stankoff.ru/about)
- Документация проекта: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Инструкции разработки: [CLAUDE.md](../CLAUDE.md)
