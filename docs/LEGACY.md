# Legacy CRM Integration

## Обзор

Legacy система — это старая CRM на PHP + MariaDB, которая работает параллельно с новым порталом. Интеграция обеспечивает **READ-ONLY** доступ к данным legacy системы.

## Подключение

### Архитектура доступа

Legacy БД (MariaDB) находится на **отдельном сервере** (185.186.143.38). Доступ ограничен **белым списком IP** — подключение возможно **только** с ВМ препрода (51.250.117.178).

```
┌─────────────────────────┐      ┌──────────────────────────┐
│  Preprod VM              │      │  Legacy Server           │
│  51.250.117.178          │      │  185.186.143.38          │
│                          │      │                          │
│  ┌───────────────────┐   │      │  ┌───────────────────┐   │
│  │ NestJS Backend    │   │      │  │  Legacy PHP App   │   │
│  │ (Docker Swarm)    │   │      │  │  (stankoff.ru)    │   │
│  │                   │   │      │  │                   │   │
│  │  ┌─────────────┐  │   │      │  │  ┌─────────────┐  │   │
│  │  │ PostgreSQL  │  │   │      │  │  │  MariaDB    │  │   │
│  │  │  (main DB)  │  │   │      │  │  │  (legacy)   │  │   │
│  │  └─────────────┘  │   │      │  │  └──────┬──────┘  │   │
│  │         │         │   │      │  └─────────┼─────────┘   │
│  │  ┌──────┴──────┐  │   │      └────────────┼────────────┘
│  │  │LegacyModule │──────── READ-ONLY ───────┘
│  │  │ (TypeORM)   │  │   │   TCP 3306 (MySQL protocol)
│  │  └─────────────┘  │   │   IP whitelisted
│  └───────────────────┘   │
└─────────────────────────┘
```

> **ВАЖНО:** Локальная разработка с legacy данными **невозможна** без доступа к удалённой БД. Дампы в legacy проекте (`/Users/ed/dev/stankoff/stankoff/dump/`) **устарели** и не содержат актуальных данных.

### Конфигурация (.env)

```env
# Preprod (реальные данные — доступ только с ВМ препрода)
LEGACY_DB_HOST=185.186.143.38
LEGACY_DB_PORT=3306
LEGACY_DB_USER=dev
LEGACY_DB_PASSWORD=rV7vO5rP2b
LEGACY_DB_NAME=stankoff

# Локальная разработка (устаревший дамп, не рекомендуется)
# LEGACY_DB_HOST=localhost
# LEGACY_DB_USER=stankoff
# LEGACY_DB_PASSWORD=stankoff
```

### Доступ к legacy БД для отладки

Прямой доступ к legacy БД возможен **только через SSH на препрод**:

```bash
# Через backend контейнер (mysql2 клиент встроен)
ssh youredik@51.250.117.178 'docker exec $(docker ps -q -f name=stankoff-preprod_backend) \
  node -e "const m=require(\"mysql2/promise\");(async()=>{
    const c=await m.createConnection({host:\"185.186.143.38\",port:3306,user:\"dev\",password:\"rV7vO5rP2b\",database:\"stankoff\"});
    const[r]=await c.query(\"SHOW TABLES\");
    console.log(JSON.stringify(r,null,2));
    await c.end()
  })()"'

# Проверка health через API
curl https://preprod.stankoff.ru/api/legacy/health
```

### Код legacy проекта

Исходный код legacy CRM (PHP) доступен локально: `/Users/ed/dev/stankoff/stankoff`

Это рабочий проект **stankoff.ru** — PHP + MariaDB, отдельный от нашего портала. Полезен для понимания бизнес-логики и структуры данных, но **не нужен** для запуска нашего backend.

---

## Статистика данных

> Данные получены с реальной legacy БД (185.186.143.38) на **2026-02-10**.

| Таблица | Записей | Описание | Используется в коде |
|---------|---------|----------|---------------------|
| `QD_requests` | **358,115** | Обращения/заявки клиентов | ✅ Миграция + синхронизация |
| `QD_answers` | **2,440,910** | Ответы на обращения | ✅ Миграция + синхронизация |
| `QD_statuses` | **19,827** | История статусов заявок | ❌ Не используется |
| `QD_attaches` | **1,835,373** | Вложения к заявкам/ответам | ❌ Не используется |
| `SS_customers` | **296,488** | Пользователи (клиенты + сотрудники) | ✅ Поиск, маппинг |
| `manager` | **147** | Сотрудники компании | ✅ Маппинг assignee |
| `department` | **13** | Отделы | ✅ Справочник |
| `managers_group` | **16** | Группы менеджеров по специализации | ❌ Entity не создана |
| `SS_managers` | **8** | Менеджеры (старая таблица) | ❌ Не используется |
| `SS_products` | **27,916** | Товары (станки, оборудование) | ✅ Picker UI |
| `SS_categories` | **1,617** | Категории товаров | ✅ Picker фильтр |
| `counterparty` | **29,059** | Контрагенты (юр. лица) | ✅ Picker UI |
| `deal` | **0** | Сделки | ⚠️ Entity есть, данных нет |
| `deal_stage` | **9** | Этапы воронки продаж | ⚠️ Entity есть, данных нет |
| `customer` | **0** | Корпоративные клиенты | ❌ Не используется |

> **Всего таблиц в legacy БД:** ~300+. Выше перечислены только таблицы, релевантные для портала.

---

## Структура основных таблиц

### SS_customers (Пользователи)

```sql
customerID        INT(11) PRIMARY KEY AUTO_INCREMENT
id                INT(11)              -- Дублирующий ID (legacy)
first_name        VARCHAR(32)          -- Имя
last_name         VARCHAR(32)          -- Фамилия
Email             VARCHAR(64)          -- ⚠️ Email (с БОЛЬШОЙ буквы!)
phone             DECIMAL(20,0)        -- Телефон
default_phone_id  BIGINT(20)           -- ID основного телефона
default_email_id  BIGINT(20)           -- ID основного email
is_manager        TINYINT(1)           -- 1 = сотрудник, 0 = клиент
default_counterparty_id INT(11)        -- Связь с контрагентом
reg_datetime      DATETIME             -- Дата регистрации
gender            VARCHAR(10)          -- Пол (MALE/FEMALE)
position          VARCHAR(70)          -- Должность
country           INT(10)              -- ID страны
region            INT(10)              -- ID региона
city              INT(10)              -- ID города
level             VARCHAR(10)          -- Уровень доступа (user/adminman)
user_is_admin     INT(11)              -- Флаг администратора
language          VARCHAR(2)           -- Язык (ru/en)
online            BIGINT(20)           -- Последняя активность (timestamp)
hash              VARCHAR(25) UNIQUE   -- Хеш для ссылок
-- Интеграции:
chat2desk_id      BIGINT(20)           -- Chat2Desk ID
has_whatsapp      TINYINT(1)           -- WhatsApp
has_viber         TINYINT(1)           -- Viber
yandex_metrika_client_id CHAR(25)      -- Яндекс.Метрика ID
supplier_id       INT(11)              -- ID поставщика
-- НЕТ колонок: enabled, last_login
```

**Всего: 296,488 записей** (данные на 2026-02-10).

**Особенности:**
- `is_manager = 1` — сотрудник компании
- `is_manager = 0` — внешний клиент
- Колонка `Email` с **большой** буквы (MySQL case-sensitive!)
- Нет флага `enabled` — все записи считаются активными

> **ВАЖНО:** Основные данные о сотрудниках хранятся в таблице `manager`, а не в `SS_customers`!

### manager (Сотрудники) ⭐ ВАЖНО

```sql
id                       INT(3) PRIMARY KEY AUTO_INCREMENT
user_id                  INT(11) NOT NULL     -- Связь с SS_customers.customerID
alias                    VARCHAR(10)          -- Короткое имя (для @mention)
department_id            TINYINT(2)           -- ID отдела
department_direction_id  TINYINT(2)           -- ID направления в отделе
authentication_method    VARCHAR(20)          -- Метод аутентификации (sms)
sms_phone_id             INT(20)              -- ID телефона для SMS
sip                      VARCHAR(100)         -- SIP номер
default_sip_id           INT(11)              -- ID SIP по умолчанию
specialty                VARCHAR(255)         -- Специализация
chat2desk_channel_id     BIGINT(20)           -- Chat2Desk канал
bitrix24_user_id         INT(11)              -- Bitrix24 ID
prostanki_id             BIGINT(20)           -- Простанки ID
telegram_id              BIGINT(20)           -- Telegram ID
vacation                 TINYINT(1)           -- 1 = в отпуске
vacation_from            INT(11)              -- Начало отпуска (timestamp)
vacation_to              INT(11)              -- Конец отпуска (timestamp)
notify_new_requests      ENUM('0','1','2')    -- Уведомления о новых заявках
notify_new_answers       ENUM('0','1','2')    -- Уведомления о новых ответах
can_get_request          TINYINT(1)           -- Может принимать заявки
can_sale                 TINYINT(1)           -- Может продавать
show_in_contacts         TINYINT(1)           -- Показывать в контактах
active                   TINYINT(1)           -- 1 = активен, 0 = уволен
sort_order               INT(3)               -- Порядок сортировки
```

**Всего: 147 менеджеров** (данные на 2026-02-10).

**Особенности:**
- `active = 0` — сотрудник уволен или деактивирован
- `vacation = 1` — сотрудник в отпуске (временно недоступен)
- `can_get_request = 0` — не назначать на заявки (например, руководитель)
- Связь с SS_customers через `user_id` → `customerID`
- `department_direction_id` — направление внутри отдела (дополнительная классификация)

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

> Таблица содержит ~86 колонок. Ниже перечислены основные, используемые в портале.

```sql
productID         INT(11) PRIMARY KEY AUTO_INCREMENT
name              VARCHAR(255)         -- Название
uri               VARCHAR(255)         -- URL slug
factory_name      VARCHAR(255)         -- Название завода-производителя
Price             DECIMAL(20,2)        -- ⚠️ Цена (с БОЛЬШОЙ буквы!)
base_price        DECIMAL(20,2)        -- Базовая цена
fob_price         DECIMAL(20,2)        -- Цена FOB
categoryID        INT(11)              -- ID категории
default_supplier  INT(11)              -- ID поставщика
in_stock          INT(11)              -- Количество на складе
product_code      VARCHAR(25)          -- Артикул
enabled           INT(11)              -- 1 = активен
brief_description MEDIUMTEXT           -- Краткое описание
sort_order        INT(11)              -- Сортировка
type              ENUM('1','2')        -- Тип товара
show_price        TINYINT(1)           -- Показывать цену
is_cart           TINYINT(1)           -- Можно в корзину
commissioning     TINYINT(1)           -- Ввод в эксплуатацию
warranty          TINYINT(2)           -- Гарантия (мес)
-- Неиспользуемые но объёмные: description*, reviews_*, views_*, meta_*
```

**Всего: 27,916 товаров** (данные на 2026-02-10).

**Особенности:**
- Колонка `Price` с **большой** буквы
- `enabled = 1` для активных товаров
- НЕТ колонки `producerID` — вместо неё `default_supplier`

### SS_categories (Категории)

> Таблица содержит ~43 колонки. Ниже основные.

```sql
categoryID        INT(11) PRIMARY KEY AUTO_INCREMENT
name              VARCHAR(255)         -- Название
uri               VARCHAR(255)         -- URL slug
parent            INT(11)              -- ID родительской категории
category_is_active INT(1)              -- ⚠️ 1 = активна (НЕ "enabled"!)
sort_order        INT(11)              -- Сортировка
manager_id        INT(11)              -- Ответственный менеджер
products_count    INT(11)              -- Кол-во товаров
instock_count     INT(11)              -- Кол-во на складе
type              VARCHAR(100)         -- Тип категории
display_type      VARCHAR(20)          -- Тип отображения (standart)
-- SEO: title, header_h1, meta_description, meta_keywords
-- Описания: description, description1-3, extra_description
-- Картинки: picture, big_picture, origin_picture, promo_picture
```

**Всего: 1,617 категорий** (данные на 2026-02-10).

**Особенности:**
- Флаг активности: `category_is_active`, **НЕ** `enabled`
- `parent = NULL` или `0` — корневая категория

### counterparty (Контрагенты)

```sql
id                INT(11) PRIMARY KEY AUTO_INCREMENT
name              VARCHAR(255)         -- Полное название (ООО "Компания")
inn               VARCHAR(15)          -- ИНН
director          VARCHAR(100)         -- Директор
type              VARCHAR(10)          -- 'legal' | 'individual'
is_foreign        TINYINT(1)           -- Иностранная компания
-- DaData (обогащённые данные):
dadata_kpp        VARCHAR(9)           -- КПП
dadata_ogrn       DECIMAL(15,0)        -- ОГРН
dadata_address    TEXT                 -- Юридический адрес
dadata_post       VARCHAR(100)         -- Почтовый адрес
dadata_status     VARCHAR(12)          -- Статус юр. лица (ACTIVE и т.д.)
dadata_registration_date VARCHAR(20)   -- Дата регистрации
dadata_liquidation_date  VARCHAR(20)   -- Дата ликвидации
-- Банковские реквизиты:
dadata_bank_name  TEXT                 -- Название банка
dadata_bank_bik   VARCHAR(9)           -- БИК
dadata_bank_korr  DECIMAL(20,0)        -- Корр. счёт
dadata_bank_ras   DECIMAL(20,0)        -- Расч. счёт
default_counterparty_bank_settlement_account_id INT(11)
-- Финансы:
capital           DECIMAL(20,0)        -- Уставной капитал
finance_income    DECIMAL(20,0)        -- Доход
finance_expense   DECIMAL(20,0)        -- Расход
finance_revenue   DECIMAL(20,0)        -- Выручка
finance_debt      DECIMAL(20,0)        -- Задолженность
finance_penalty   DECIMAL(20,0)        -- Штрафы
finance_year      YEAR                 -- Год отчётности
employee_count    INT(11)              -- Количество сотрудников
-- Для физ. лиц:
passport_series   CHAR(4)              -- Серия паспорта
passport_number   CHAR(6)              -- Номер паспорта
```

**Всего: 29,059 контрагентов** (данные на 2026-02-10).

**Особенности:**
- Данные обогащены через **DaData API** (префикс `dadata_`)
- НЕТ колонок: `kpp`, `ogrn`, `address` без префикса
- НЕТ колонок: `created_at`, `updated_at`

### QD_requests (Обращения)

```sql
RID               INT(11) PRIMARY KEY AUTO_INCREMENT  -- ⚠️ Не "id"!
customerID        INT(11) NOT NULL     -- ID клиента (SS_customers.customerID)
UID               INT(11)              -- ID пользователя (SS_customers.customerID)
manager_id        INT(11)              -- ID менеджера (manager.id)
manID             INT(11)              -- ID менеджера (SS_managers.managerID, устаревшее)
creator_user_id   INT(11)              -- Кто создал заявку
add_date          DATETIME             -- Дата создания
update_date       DATETIME             -- Дата последнего обновления
answer_date       TIMESTAMP            -- Дата последнего ответа
subject           VARCHAR(255)         -- Тема заявки
closed            TINYINT(1)           -- Статус: 0=открыта, 1=закрыта, -1=default
pause             TINYINT(1)           -- На паузе
type              VARCHAR(15)          -- Тип заявки
transport_type    VARCHAR(20)          -- Канал связи (email, phone, whatsapp...)
contact_channel_transport_id INT(11)   -- ID транспорта
origins           VARCHAR(20)          -- Источник (self, email, site...)
source_page       TEXT                 -- Страница-источник
unread            ENUM('0','1')        -- Непрочитано менеджером
clunread          ENUM('0','1')        -- Непрочитано клиентом
comments          MEDIUMTEXT           -- Внутренние комментарии менеджера
last_answer       BIGINT(20)           -- ID последнего ответа
last_comment_id   BIGINT(20)           -- ID последнего комментария
first_reaction_time TIMESTAMP          -- Время первой реакции (SLA)
ontime_date       DATETIME             -- Запланированная дата ответа
forgotten_date    TIMESTAMP            -- Дата "забытой" заявки
-- Маркетинг/аналитика:
utm_visit_id      INT(11)              -- UTM визит
roistat_visit     INT(11)              -- Roistat визит
adv               VARCHAR(20)          -- Рекламный источник
action_position   VARCHAR(50)          -- Позиция действия
-- Флаги:
mailed            TINYINT(1)           -- Отправлено email
mailopened        TINYINT(1)           -- Email открыт
phoned            TINYINT(1)           -- Звонили
sale              TINYINT(1)           -- Продажа
-- Интеграции:
chat2desk_id      BIGINT(20)           -- Chat2Desk ID
hash              VARCHAR(30)          -- Хеш для клиентского доступа
client_ip         VARCHAR(15)          -- IP клиента
```

**КРИТИЧЕСКИ ВАЖНО для маппинга:**
- PK = `RID` (не `id`!)
- **НЕТ** колонок: `body`, `status_id`, `close_date`, `priority`
- Статус заявки определяется только полем `closed` (0/1/-1)
- `manager_id` → ссылка на `manager.id` (новая таблица)
- `manID` → ссылка на `SS_managers.managerID` (устаревшая таблица)

### QD_answers (Ответы)

```sql
AID               INT(11) PRIMARY KEY AUTO_INCREMENT  -- ⚠️ Не "id"!
RID               INT(11) NOT NULL     -- ID заявки (QD_requests.RID)
UID               INT(11)              -- ID пользователя (SS_customers.customerID)
is_client         TINYINT(1)           -- 1=клиент, 0=сотрудник
manID             INT(11) NOT NULL     -- ID менеджера (SS_managers.managerID)
add_date          DATETIME             -- Дата создания
text              MEDIUMTEXT           -- Текст ответа (может содержать HTML)
subject           VARCHAR(255)         -- Тема
type              VARCHAR(15)          -- Тип
starter           INT(1)               -- Первое сообщение в заявке
is_request        TINYINT(1)           -- Является запросом
creator_user_id   INT(11)              -- Кто создал
forward_from_answer_id INT(11)         -- Переслано из
-- Каналы/интеграции:
transport         VARCHAR(20)          -- Канал (email, whatsapp, telegram...)
origins           VARCHAR(20)          -- Источник
email_message_id  VARCHAR(255)         -- Email Message-ID
email_original_body TEXT               -- Оригинальное тело email
email_addresses   TEXT                 -- Email адреса
messanger_number  DECIMAL(20,0)        -- Номер в мессенджере
chat2desk_id      BIGINT(20)           -- Chat2Desk ID
contact_channel_transport_id INT(11)   -- ID транспорта
integration_account_id INT(11)         -- ID интеграции
-- Маркетинг:
utm_visit_id      INT(11)
roistat_visit     INT(11)
action_position   VARCHAR(50)
adv               VARCHAR(20)
-- Флаги:
rating            INT(1)               -- Рейтинг ответа
marked            INT(1)               -- Помечен
mailed            INT(1)               -- Отправлен email
request_answer_send_status_id TINYINT  -- Статус отправки
```

**КРИТИЧЕСКИ ВАЖНО:**
- PK = `AID` (не `id`!)
- FK к заявке = `RID` (не `requestId`!)
- Поле `text` (в старой версии было `answer`)
- **НЕТ** полей: `is_hidden`, `is_internal`
- Есть `is_client` — определяет автора (клиент vs сотрудник)

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
├── legacy.module.ts                    # NestJS модуль
├── legacy.controller.ts                # REST API контроллер (read-only)
├── legacy.controller.spec.ts           # Тесты контроллера
├── legacy-import.controller.ts         # Импорт сотрудников в Keycloak
├── legacy-import.controller.spec.ts    # Тесты импорта
├── legacy-migration.controller.ts      # ⭐ REST API миграции данных
├── legacy-migration.controller.spec.ts # ⭐ Тесты контроллера миграции
├── legacy-database.config.ts           # Конфигурация MySQL DataSource
├── dto/
│   ├── index.ts
│   ├── legacy-customer.dto.ts
│   ├── legacy-product.dto.ts
│   ├── legacy-counterparty.dto.ts
│   ├── legacy-deal.dto.ts
│   ├── legacy-employee.dto.ts          # Сотрудники и отделы
│   └── legacy-migration.dto.ts         # ⭐ DTOs для миграции
├── entities/
│   ├── index.ts
│   ├── legacy-customer.entity.ts
│   ├── legacy-product.entity.ts
│   ├── legacy-category.entity.ts
│   ├── legacy-counterparty.entity.ts
│   ├── legacy-deal.entity.ts
│   ├── legacy-deal-stage.entity.ts
│   ├── legacy-request.entity.ts
│   ├── legacy-answer.entity.ts
│   ├── legacy-manager.entity.ts        # Менеджеры
│   ├── legacy-department.entity.ts     # Отделы
│   └── legacy-migration-log.entity.ts  # ⭐ Лог миграции (PostgreSQL!)
└── services/
    ├── legacy.service.ts               # Основной сервис (read-only + batch методы)
    ├── legacy.service.spec.ts          # Тесты сервиса
    ├── legacy-url.service.ts           # Генерация URL legacy CRM
    ├── legacy-url.service.spec.ts      # Тесты URL сервиса
    ├── legacy-migration.service.ts     # ⭐ Сервис миграции данных
    ├── legacy-migration.service.spec.ts# ⭐ Тесты миграции (59 тестов)
    ├── legacy-sync.service.ts          # ⭐ Cron-синхронизация
    └── legacy-sync.service.spec.ts     # ⭐ Тесты синхронизации (24 теста)
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

### Фаза 3: Frontend компоненты ✅ DONE

- [x] `LegacyCustomerPicker` — выбор клиента из legacy с поиском и ссылкой на CRM
- [x] `LegacyProductPicker` — выбор товара с фильтром по категории и статусом наличия
- [x] `LegacyCounterpartyPicker` — выбор контрагента с ИНН
- [x] `LegacyDealLink` — ссылка на сделку с деталями (сумма, этап, контрагент)
- [x] `LegacyDealsList` — список ссылок на несколько сделок
- [x] API клиент: `lib/api/legacy.ts` — все методы + `legacyUrls` для генерации URL

**Компоненты:** `apps/frontend/src/components/legacy/`

> **Примечание:** `LegacyEmployeePicker` не создавался как отдельный компонент — сотрудники импортируются в Keycloak и доступны через стандартный UserField.

---

### Фаза 4: Миграция данных ✅ DONE

Реализован полноценный сервис миграции данных из legacy CRM (QD_requests → Entity, QD_answers → Comment).

**Что реализовано:**
- [x] `LegacyMigrationService` — основной сервис миграции (batch processing по 500 заявок)
- [x] `LegacyMigrationController` — REST API для управления миграцией
- [x] `LegacyMigrationLog` entity — отслеживание прогресса и идемпотентность
- [x] Маппинг сотрудников по email (case-insensitive) из Users таблицы
- [x] Системный пользователь `legacy-system@stankoff.ru` для внешних клиентов (286K)
- [x] Workspace `Legacy CRM (Миграция)` с prefix `LEG` и настроенными секциями полей
- [x] Маппинг статусов: `closed=1`→`'closed'`, иначе→`'new'` (в legacy **нет** `status_id`, `priority`)
- [x] В legacy нет приоритетов — все мигрируются как `'medium'`
- [x] HTML-очистка ответов (legacy содержит HTML-разметку)
- [x] Bulk INSERT через QueryRunner (не через EntityService — избегаем WebSocket, BPMN, SLA триггеры)
- [x] `INSERT ... ON CONFLICT ("customId") DO NOTHING` — идемпотентность
- [x] CustomId формат: `LEG-{RID}` (например `LEG-12345`)
- [x] Валидация после миграции (spot-check целостности)
- [x] Retry failed записей
- [x] Unit-тесты (59 + 17 тестов)

**Ключевые решения:**
- Внешние клиенты (286K) НЕ создаются как Users — используется системный пользователь, данные клиента в `entity.data` JSONB
- Bulk INSERT через QueryRunner, НЕ EntityService.create() (избежание overhead: WebSocket, BPMN, SLA, email, audit)
- Batch по 500, ~30-60 минут на entities, ~2-4 часа на всё с комментариями

**API миграции:**
```bash
# Превью (без побочных эффектов)
curl https://preprod.stankoff.ru/api/legacy/migration/preview

# Запуск миграции
curl -X POST https://preprod.stankoff.ru/api/legacy/migration/start \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 500}'

# Прогресс
curl https://preprod.stankoff.ru/api/legacy/migration/progress

# Остановка
curl -X POST https://preprod.stankoff.ru/api/legacy/migration/stop

# Валидация целостности
curl -X POST https://preprod.stankoff.ru/api/legacy/migration/validate

# Лог миграции
curl "https://preprod.stankoff.ru/api/legacy/migration/log?status=failed&limit=20"

# Повтор ошибочных записей
curl -X POST https://preprod.stankoff.ru/api/legacy/migration/retry-failed
```

### Фаза 5: Синхронизация ✅ DONE

Реализован cron-based сервис синхронизации новых/обновлённых заявок из legacy CRM.

**Что реализовано:**
- [x] `LegacySyncService` — cron-синхронизация каждые 5 минут
- [x] Обнаружение новых заявок (по `update_date > lastSyncTimestamp`)
- [x] Миграция новых заявок через `migrateBatchRequests`
- [x] Обновление существующих заявок (статус, приоритет)
- [x] Синхронизация новых ответов → комментарии (с дедупликацией)
- [x] Enable/disable через API
- [x] Graceful degradation при недоступности legacy БД
- [x] Unit-тесты (24 теста)

**API синхронизации:**
```bash
# Статус
curl https://preprod.stankoff.ru/api/legacy/sync/status

# Включить
curl -X POST https://preprod.stankoff.ru/api/legacy/sync/enable

# Выключить
curl -X POST https://preprod.stankoff.ru/api/legacy/sync/disable

# Запустить вручную
curl -X POST https://preprod.stankoff.ru/api/legacy/sync/run-now
```

### Фаза 6: Полная миграция ⏸️ ОТЛОЖЕНО

- [ ] Постепенный перевод пользователей на новый портал
- [ ] Отключение legacy CRM
- [ ] Архивация legacy БД

---

## Полезные команды

```bash
# Проверка подключения к legacy через API
curl https://preprod.stankoff.ru/api/legacy/health

# SQL запросы к реальной legacy БД (через SSH на препрод)
ssh youredik@51.250.117.178 'docker exec $(docker ps -q -f name=stankoff-preprod_backend) \
  node -e "const m=require(\"mysql2/promise\");(async()=>{
    const c=await m.createConnection({host:\"185.186.143.38\",port:3306,user:\"dev\",password:\"rV7vO5rP2b\",database:\"stankoff\"});
    const[r]=await c.query(\"SELECT COUNT(*) as cnt FROM SS_customers\");
    console.log(r[0].cnt);
    await c.end()
  })()"'

# Просмотр структуры таблицы
# (заменить DESCRIBE SS_customers на нужную таблицу)
ssh youredik@51.250.117.178 'docker exec $(docker ps -q -f name=stankoff-preprod_backend) \
  node -e "const m=require(\"mysql2/promise\");(async()=>{
    const c=await m.createConnection({host:\"185.186.143.38\",port:3306,user:\"dev\",password:\"rV7vO5rP2b\",database:\"stankoff\"});
    const[r]=await c.query(\"DESCRIBE SS_customers\");
    console.log(JSON.stringify(r,null,2));
    await c.end()
  })()"'

# Тесты legacy модуля
npm run test -- --testPathPattern="legacy"
```

> **Примечание:** MySQL клиент НЕ установлен на препроде. Запросы выполняются через `node` + `mysql2` внутри backend контейнера.

---

## Контакты и ресурсы

| Ресурс | Расположение | Описание |
|--------|-------------|----------|
| Legacy код (PHP) | `/Users/ed/dev/stankoff/stankoff` | Локальная копия исходников |
| Legacy БД (MariaDB) | `185.186.143.38:3306` | Доступ только с IP препрода |
| Препрод сервер | `51.250.117.178` | SSH: `youredik@...` |
| Legacy CRM (веб) | `https://www.stankoff.ru/crm/` | Рабочая CRM |
| Дампы БД (устарели) | `dump/stankoff.sql` в legacy проекте | Не использовать для разработки! |
