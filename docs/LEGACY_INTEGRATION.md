# Legacy CRM Integration

## Обзор

Legacy система — это старая CRM на PHP + MariaDB, которая работает параллельно с новым порталом. Интеграция обеспечивает **READ-ONLY** доступ к данным legacy системы.

## Подключение

### Конфигурация (.env)

```env
LEGACY_DB_HOST=localhost        # На препроде: IP legacy сервера
LEGACY_DB_PORT=3306
LEGACY_DB_USER=stankoff
LEGACY_DB_PASSWORD=stankoff
LEGACY_DB_NAME=stankoff
```

### Локальная разработка

Legacy БД разворачивается из проекта `/Users/ed/dev/stankoff/stankoff`:

```bash
cd /Users/ed/dev/stankoff/stankoff
docker compose up -d
```

MariaDB контейнер автоматически инициализируется дампами:
- `dump/stankoff.sql` — основные данные
- `dump/metrics.sql` — метрики

### Архитектура

```
┌─────────────────┐      ┌─────────────────┐
│  NestJS Backend │      │  Legacy PHP App │
│                 │      │                 │
│  ┌───────────┐  │      │  ┌───────────┐  │
│  │ PostgreSQL│  │      │  │  MariaDB  │  │
│  │  (main)   │  │      │  │ (legacy)  │  │
│  └───────────┘  │      │  └───────────┘  │
│        │        │      │        │        │
│  ┌─────┴─────┐  │      └────────┼────────┘
│  │LegacyModule│──────────READ───┘
│  │(TypeORM)  │  │        ONLY
│  └───────────┘  │
└─────────────────┘
```

---

## Статистика данных

| Таблица | Записей | Описание |
|---------|---------|----------|
| `SS_customers` | **286,736** | Пользователи (клиенты + сотрудники) |
| `manager` | **141** (87 активных) | ⭐ Сотрудники компании |
| `department` | **13** | Отделы |
| `managers_group` | **16** | Группы менеджеров по специализации |
| `SS_products` | **27,549** | Товары (станки, оборудование) |
| `SS_categories` | **1,608** (657 активных) | Категории товаров |
| `counterparty` | **27,278** | Контрагенты (юр. лица) |
| `QD_requests` | **344,612** | Обращения/заявки клиентов |
| `QD_answers` | **2,322,514** | Ответы на обращения |
| `order` | **28,556** | Заказы (новая система) |
| `SS_orders` | **4** | Заказы (старая система, устаревшая) |
| `call` | **1,169,173** | Звонки |
| `deal` | **0** | Сделки (не используется) |

### Сотрудники (важно!)

| Метрика | Значение |
|---------|----------|
| Всего сотрудников | 141 |
| Активных | **87** |
| Неактивных (уволены) | 54 |
| Могут принимать заявки | 51 |
| Отделов | 13 |
| Специализаций (групп) | 16 |

---

## Структура основных таблиц

### SS_customers (Пользователи)

```sql
customerID        INT PRIMARY KEY AUTO_INCREMENT
first_name        VARCHAR(32)          -- Имя
last_name         VARCHAR(32)          -- Фамилия
Email             VARCHAR(64)          -- Email (регистр!)
phone             DECIMAL(20,0)        -- Телефон
is_manager        TINYINT(1)           -- 1 = сотрудник, 0 = клиент
default_counterparty_id  INT           -- Связь с контрагентом
reg_datetime      DATETIME             -- Дата регистрации
-- НЕТ колонок: enabled, last_login
```

**Особенности:**
- `is_manager = 1` — сотрудник компании (всего 19 записей в SS_customers)
- `is_manager = 0` — внешний клиент
- Колонка `Email` с большой буквы (MySQL case-sensitive)
- Нет флага `enabled` — все записи считаются активными
- Дополнительные поля: `level` (adminman/user), `user_is_admin`, `online` (timestamp)

> **ВАЖНО:** Основные данные о сотрудниках хранятся в таблице `manager`, а не в `SS_customers`!

### manager (Сотрудники) ⭐ ВАЖНО

```sql
id                INT PRIMARY KEY AUTO_INCREMENT
user_id           INT NOT NULL         -- Связь с SS_customers.customerID
alias             VARCHAR(10)          -- Короткое имя (для @mention)
department_id     TINYINT              -- ID отдела
active            TINYINT(1)           -- 1 = активен, 0 = уволен/неактивен
vacation          TINYINT(1)           -- 1 = в отпуске
vacation_from     INT                  -- Начало отпуска (timestamp)
vacation_to       INT                  -- Конец отпуска (timestamp)
can_get_request   TINYINT(1)           -- Может принимать заявки
can_sale          TINYINT(1)           -- Может продавать
show_in_contacts  TINYINT(1)           -- Показывать в контактах
sip               VARCHAR(100)         -- SIP номер
telegram_id       BIGINT               -- Telegram ID
sort_order        INT                  -- Порядок сортировки
```

**Статистика сотрудников:**
| Метрика | Значение |
|---------|----------|
| Всего менеджеров | **141** |
| Активных | **87** |
| Неактивных (уволены) | **54** |
| Могут принимать заявки | 51 |
| Могут продавать | 36 |

**Особенности:**
- `active = 0` — сотрудник уволен или деактивирован
- `vacation = 1` — сотрудник в отпуске (временно недоступен)
- `can_get_request = 0` — не назначать на заявки (например, руководитель)
- Связь с SS_customers через `user_id` → `customerID`

### department (Отделы)

```sql
id                TINYINT PRIMARY KEY AUTO_INCREMENT
alias             VARCHAR(15)          -- Код отдела (sales, service, etc.)
title             VARCHAR(100)         -- Название
phone_number      DECIMAL(20,0)        -- Телефон отдела
internal_number   DECIMAL(5,0)         -- Внутренний номер
sort_order        TINYINT              -- Порядок сортировки
```

**Список отделов (13 шт):**
| ID | Alias | Название | Сотрудников |
|----|-------|----------|-------------|
| 3 | sales | Отдел продаж | 36 |
| 5 | service | Сервисный отдел | 29 |
| 6 | marketing | Маркетинговый отдел | 22 |
| 8 | fea | Отдел ВЭД | 7 |
| 11 | warehouse | Склад | 6 |
| 2 | accounting | Бухгалтерия | 6 |
| 9 | legal | Юридический отдел | 4 |
| 4 | logistics | Логистический отдел | 3 |
| 10 | tender | Тендерный отдел | 2 |
| 12 | hr | Отдел HR | 2 |
| 1 | admin | Административный | 2 |
| 7 | it | Отдел ИТ | 1 |
| 13 | financial | Финансовый отдел | 1 |

### managers_group (Группы менеджеров)

Группы по специализации (типам оборудования):

```sql
id                TINYINT PRIMARY KEY AUTO_INCREMENT
title             VARCHAR(255)         -- Название группы
is_personal       TINYINT(1)           -- Персональная группа
is_active         TINYINT(1)           -- Активна
```

**Активные группы (16 шт):**
- Мебелька, Столярка, Оптоволоконные лазеры
- Лазерные очистители и сварка, Прямые продажи
- Фрезеры с ЧПУ, CO2 лазеры, Дробилки мобильные
- Лазерные маркеры, Металлообработка, Заточное
- Лесопилка + Поддоны + Полимерка, Упаковка
- Шлифовальные станки по дереву, Расходка и инструменты

**Связь managers_group_manager:**
```sql
managers_group_id TINYINT              -- ID группы
manager_user_id   INT                  -- user_id менеджера (не manager.id!)
percent           DECIMAL(3,0)         -- Процент распределения заявок
is_active         TINYINT(1)           -- Активен в группе
```

### SS_products (Товары)

```sql
productID         INT PRIMARY KEY AUTO_INCREMENT
name              VARCHAR(255)         -- Название
uri               VARCHAR(255)         -- URL slug
Price             DECIMAL(20,2)        -- Цена (с большой буквы!)
categoryID        INT                  -- ID категории
default_supplier  INT                  -- ID поставщика
in_stock          INT                  -- Количество на складе
product_code      VARCHAR(25)          -- Артикул
factory_name      VARCHAR(255)         -- Название завода
enabled           INT                  -- 1 = активен
brief_description MEDIUMTEXT           -- Краткое описание
sort_order        INT                  -- Сортировка
```

**Особенности:**
- Колонка `Price` с большой буквы
- `enabled = 1` для активных товаров
- НЕТ колонки `producerID` — вместо неё `default_supplier`

### SS_categories (Категории)

```sql
categoryID        INT PRIMARY KEY AUTO_INCREMENT
name              VARCHAR(255)         -- Название
uri               VARCHAR(255)         -- URL slug
parent            INT                  -- ID родительской категории
category_is_active INT                 -- 1 = активна (НЕ enabled!)
sort_order        INT                  -- Сортировка
```

**Особенности:**
- Флаг активности: `category_is_active`, НЕ `enabled`
- `parent = NULL` или `0` — корневая категория
- 657 активных категорий из 1,608

### counterparty (Контрагенты)

```sql
id                INT PRIMARY KEY AUTO_INCREMENT
name              VARCHAR(255)         -- Полное название (ООО "Компания")
inn               VARCHAR(15)          -- ИНН
dadata_kpp        VARCHAR(9)           -- КПП (из DaData)
dadata_ogrn       DECIMAL(15,0)        -- ОГРН (из DaData)
dadata_address    TEXT                 -- Адрес (из DaData)
director          VARCHAR(100)         -- Директор
dadata_status     VARCHAR(12)          -- Статус юр. лица
type              VARCHAR(10)          -- 'legal' | 'individual'
```

**Особенности:**
- Данные обогащены через DaData API (префикс `dadata_`)
- НЕТ колонок: `kpp`, `ogrn`, `address` без префикса
- НЕТ колонок: `created_at`, `updated_at`, `dadata_data`, `dadata_type`

### QD_requests (Обращения)

```sql
id                INT PRIMARY KEY AUTO_INCREMENT
customer_id       INT                  -- ID клиента (SS_customers)
status_id         INT                  -- ID статуса
manager_id        INT                  -- ID менеджера
subject           VARCHAR(255)         -- Тема
created_at        DATETIME             -- Создано
updated_at        DATETIME             -- Обновлено
```

**Особенности:**
- 344K+ обращений — основной массив данных для миграции
- Связь через `QD_answers` — 2.3M ответов

---

## API Endpoints

Все эндпоинты публичные (без авторизации) для удобства разработки.

### Health Check
```
GET /api/legacy/health
→ { "available": true, "message": "Legacy database is connected" }
```

### Customers (Клиенты)
```
GET /api/legacy/customers/search?q=иванов&limit=10&offset=0&employeesOnly=false
GET /api/legacy/customers/:id
```

### Products (Товары)
```
GET /api/legacy/products/search?q=станок&limit=10&offset=0&categoryId=123&inStockOnly=true
GET /api/legacy/products/:id
```

### Categories (Категории)
```
GET /api/legacy/categories
→ Возвращает только активные (category_is_active = 1)
```

### Counterparties (Контрагенты)
```
GET /api/legacy/counterparties/search?q=ооо&limit=10&offset=0
GET /api/legacy/counterparties/:id
```

### Deals (Сделки)
```
GET /api/legacy/deals?counterpartyId=123&employeeUserId=456&limit=10&offset=0
GET /api/legacy/deals/:id
→ Таблица пустая, не используется
```

### Employees (Сотрудники) ⭐ NEW
```
GET /api/legacy/employees/search?q=текст&limit=10&activeOnly=true&departmentId=3
GET /api/legacy/employees/all     → Все активные сотрудники (для импорта в Keycloak)
GET /api/legacy/employees/:id
GET /api/legacy/departments       → Список отделов с количеством сотрудников
```

---

## Код модуля

### Файловая структура

```
apps/backend/src/modules/legacy/
├── legacy.module.ts              # NestJS модуль
├── legacy.controller.ts          # REST API контроллер
├── legacy.controller.spec.ts     # Тесты контроллера
├── legacy-database.config.ts     # Конфигурация MySQL DataSource
├── dto/
│   ├── index.ts
│   ├── legacy-customer.dto.ts
│   ├── legacy-product.dto.ts
│   ├── legacy-counterparty.dto.ts
│   ├── legacy-deal.dto.ts
│   └── legacy-employee.dto.ts      # ⭐ Сотрудники и отделы
├── entities/
│   ├── index.ts
│   ├── legacy-customer.entity.ts
│   ├── legacy-product.entity.ts
│   ├── legacy-category.entity.ts
│   ├── legacy-counterparty.entity.ts
│   ├── legacy-deal.entity.ts
│   ├── legacy-deal-stage.entity.ts
│   ├── legacy-request.entity.ts
│   ├── legacy-manager.entity.ts    # ⭐ Менеджеры
│   └── legacy-department.entity.ts # ⭐ Отделы
└── services/
    ├── legacy.service.ts         # Основной сервис
    └── legacy.service.spec.ts    # Тесты сервиса
```

### Ключевые особенности

1. **Отдельный DataSource** — legacy entities используют MySQL, а не PostgreSQL
2. **Graceful degradation** — если legacy БД недоступна, API возвращает пустые результаты
3. **Изоляция entities** — в `typeorm.config.ts` явно исключена папка `/legacy/`

```typescript
// typeorm.config.ts
const entityPatterns = [
  __dirname + '/../modules/analytics/*.entity{.ts,.js}',
  // ... все модули КРОМЕ legacy
  __dirname + '/../modules/workspace/*.entity{.ts,.js}',
];
```

---

## Известные проблемы

### 1. Несоответствие колонок

Оригинальные entities были созданы по предположениям, а не по реальной схеме. Исправлены:

| Entity | Было | Стало |
|--------|------|-------|
| Customer | `reg_date` | `reg_datetime` |
| Customer | `enabled`, `last_login` | Удалены |
| Product | `producerID` | `default_supplier` |
| Category | `enabled` | `category_is_active` |
| Counterparty | Много полей | Переделано под DaData |

### 2. Case-sensitive колонки

MySQL чувствителен к регистру в именах колонок:
- `Email` (не `email`)
- `Price` (не `price`)

### 3. SLA Service Error ✅ ИСПРАВЛЕНО

~~В логах ошибка `column instance.slaDefinitionId does not exist`~~ — исправлено.

**Причина:** Entity использовали camelCase имена колонок, но в миграции были snake_case.

**Решение:** Добавлен маппинг `name:` во все колонки SLA entities:
- `sla-instance.entity.ts`
- `sla-definition.entity.ts`
- `sla-event.entity.ts`

---

## План дальнейшей интеграции

### Фаза 1: Базовая интеграция ✅ DONE

- [x] Создан LegacyModule с отдельным DataSource
- [x] Реализованы entities для основных таблиц
- [x] REST API для поиска клиентов, товаров, контрагентов
- [x] Graceful degradation при недоступности legacy БД
- [x] Unit-тесты (100% coverage)
- [x] **API для сотрудников** (manager, department)

### Фаза 2: Импорт сотрудников в Keycloak ✅ DONE

Реализован полноценный сервис импорта сотрудников из legacy CRM в Keycloak.

**Что реализовано:**
- [x] `KeycloakAdminService` — сервис для работы с Keycloak Admin API
- [x] `LegacyImportController` — REST API для импорта
- [x] Генерация безопасных паролей (16+ символов, все типы символов)
- [x] Обязательная смена пароля при первом входе (`requiredActions: ['UPDATE_PASSWORD']`)
- [x] Сохранение атрибутов из legacy (alias, department, telegramId, и т.д.)
- [x] Unit-тесты (30 новых тестов)

**Данные для импорта (87 активных сотрудников):**
| Поле legacy | Поле Keycloak | Описание |
|-------------|---------------|----------|
| `SS_customers.Email` | `email` + `username` | Email как логин |
| `SS_customers.first_name` | `firstName` | Имя |
| `SS_customers.last_name` | `lastName` | Фамилия |
| `manager.alias` | `attributes.alias` | Короткое имя для @mention |
| `department.title` | `attributes.department` | Отдел |
| `manager.can_get_request` | `attributes.canGetRequest` | Может принимать заявки |
| `manager.telegram_id` | `attributes.telegramId` | Для уведомлений |
| `manager.id` | `attributes.legacyManagerId` | ID в legacy для связи |

**API импорта:**
```bash
# Проверить статус готовности
curl http://localhost:3001/api/legacy/import/status

# Предпросмотр импорта
curl http://localhost:3001/api/legacy/import/preview

# Предпросмотр по отделу
curl "http://localhost:3001/api/legacy/import/preview?departmentId=3"

# Сухой запуск (без создания пользователей)
curl -X POST http://localhost:3001/api/legacy/import/employees \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Реальный импорт
curl -X POST http://localhost:3001/api/legacy/import/employees \
  -H "Content-Type: application/json" \
  -d '{"skipExisting": true}'

# Тест импорта одного сотрудника
curl -X POST http://localhost:3001/api/legacy/import/employees/test \
  -H "Content-Type: application/json" \
  -d '{"employeeId": 148, "dryRun": true}'

# Экспорт с паролями в CSV
curl -X POST http://localhost:3001/api/legacy/import/employees/export-credentials \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Сброс паролей всем пользователям (кроме admin)
curl -X POST http://localhost:3001/api/legacy/import/employees/reset-passwords \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Список пользователей в Keycloak (для отладки)
curl "http://localhost:3001/api/legacy/import/keycloak-users?max=100"
```

**Настройка Keycloak Admin API:**
```env
# Вариант 1: Client Credentials (рекомендуется)
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli
KEYCLOAK_ADMIN_CLIENT_SECRET=your-secret

# Вариант 2: Admin credentials
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin-password
```

**Аватарки сотрудников:**
- В legacy есть колонка `SS_customers.useravatar` (имена файлов)
- Файлы хранятся в `/photo/` на production сервере
- Локально директория пустая (не коммитятся)
- TODO: Загрузить аватарки с production и импортировать

### Фаза 3: Frontend компоненты (по необходимости)

- [ ] `LegacyCustomerPicker` — выбор клиента из legacy
- [ ] `LegacyProductPicker` — выбор товара
- [ ] `LegacyCounterpartyPicker` — выбор контрагента
- [ ] `LegacyEmployeePicker` — выбор сотрудника
- [ ] Интеграция в формы создания/редактирования Entity

---

## ⏸️ Отложенные фазы (полный переход)

> **РЕШЕНИЕ (2026-02-05):** Полный переход с legacy на новый портал будет **постепенным**.
>
> Текущая стратегия:
> - ✅ **Интеграция** — чтение данных из legacy (клиенты, товары, контрагенты)
> - ✅ **Сотрудники** — импортированы в Keycloak, могут логиниться на новой платформе
> - ⏸️ **Миграция данных** — отложена до принятия решения о полном переходе
> - ⏸️ **Синхронизация** — отложена
>
> Legacy CRM продолжает работать параллельно для существующих процессов.

### Фаза 4: Миграция данных ⏸️ ОТЛОЖЕНО

- [ ] Импорт QD_requests → Entity (заявки)
- [ ] Импорт QD_answers → Comments (ответы)
- [ ] Маппинг SS_customers → Users (клиенты, не сотрудники)
- [ ] Маппинг counterparty → новая таблица контрагентов

### Фаза 5: Синхронизация ⏸️ ОТЛОЖЕНО

- [ ] Real-time синхронизация новых заявок
- [ ] Webhooks для событий в legacy
- [ ] Двусторонняя синхронизация статусов
- [ ] Синхронизация отпусков/активности сотрудников

### Фаза 6: Полная миграция ⏸️ ОТЛОЖЕНО

- [ ] Постепенный перевод пользователей на новый портал
- [ ] Отключение legacy CRM
- [ ] Архивация legacy БД

---

## Полезные команды

```bash
# Запуск legacy БД локально
cd /Users/ed/dev/stankoff/stankoff && docker compose up -d

# Проверка подключения
curl http://localhost:3001/api/legacy/health

# SQL запросы к legacy
docker exec stankoff-mariadb-1 mariadb -ustankoff -pstankoff stankoff -e "SELECT COUNT(*) FROM SS_customers"

# Просмотр структуры таблицы
docker exec stankoff-mariadb-1 mariadb -ustankoff -pstankoff stankoff -e "DESCRIBE SS_customers"

# Тесты legacy модуля
npm run test -- --testPathPattern="legacy"
```

---

## Контакты и ресурсы

- Legacy проект: `/Users/ed/dev/stankoff/stankoff`
- Docker compose: `compose.yml` в legacy проекте
- Дампы БД: `dump/stankoff.sql`, `dump/metrics.sql`
