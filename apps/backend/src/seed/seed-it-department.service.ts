import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../modules/workspace/workspace-member.entity';
import { WorkspaceEntity } from '../modules/entity/entity.entity';
import { Comment } from '../modules/entity/comment.entity';
import { Section } from '../modules/section/section.entity';

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}

// ─── Типы ────────────────────────────────────────────────────────────────────

interface TaskDef {
  num: number;
  title: string;
  status: string;
  priority: string;
  taskType: string;
  storyPoints: number;
  createdDaysAgo: number;
  assigneeEmail: string;
}

interface CommentDef {
  authorEmail: string;
  text: string;
  offsetDays: number; // offset from entity createdAt (positive = later)
}

// ─── Данные задач ────────────────────────────────────────────────────────────

const TASKS: TaskDef[] = [
  // ═══ Завершённые (12) ═══
  { num: 1, title: 'Инициализация проекта: NestJS + Next.js монорепо', status: 'done', priority: 'high', taskType: 'infrastructure', storyPoints: 13, createdDaysAgo: 180, assigneeEmail: 'youredik@gmail.com' },
  { num: 2, title: 'Авторизация через Keycloak SSO', status: 'done', priority: 'critical', taskType: 'feature', storyPoints: 8, createdDaysAgo: 160, assigneeEmail: 'youredik@gmail.com' },
  { num: 3, title: 'CRUD сущностей и рабочих пространств', status: 'done', priority: 'high', taskType: 'feature', storyPoints: 13, createdDaysAgo: 145, assigneeEmail: 'youredik@gmail.com' },
  { num: 4, title: 'Канбан-доска с drag-and-drop (@dnd-kit)', status: 'done', priority: 'high', taskType: 'feature', storyPoints: 8, createdDaysAgo: 130, assigneeEmail: 'youredik@gmail.com' },
  { num: 5, title: 'Табличное представление с пагинацией и сортировкой', status: 'done', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 115, assigneeEmail: 'youredik@gmail.com' },
  { num: 6, title: 'Rich-text комментарии (Tiptap editor)', status: 'done', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 100, assigneeEmail: 'youredik@gmail.com' },
  { num: 7, title: 'WebSocket real-time обновления (Socket.IO)', status: 'done', priority: 'high', taskType: 'feature', storyPoints: 8, createdDaysAgo: 90, assigneeEmail: 'youredik@gmail.com' },
  { num: 8, title: 'BPMN движок: интеграция Camunda/Zeebe', status: 'done', priority: 'critical', taskType: 'feature', storyPoints: 21, createdDaysAgo: 75, assigneeEmail: 'youredik@gmail.com' },
  { num: 9, title: 'Миграция Legacy CRM: 356K заявок + 2.2M комментариев', status: 'done', priority: 'critical', taskType: 'infrastructure', storyPoints: 13, createdDaysAgo: 50, assigneeEmail: 'youredik@gmail.com' },
  { num: 10, title: 'AI классификация заявок (YandexGPT + Embeddings)', status: 'done', priority: 'medium', taskType: 'feature', storyPoints: 13, createdDaysAgo: 40, assigneeEmail: 'youredik@gmail.com' },
  { num: 11, title: 'SLA мониторинг и уведомления', status: 'done', priority: 'high', taskType: 'feature', storyPoints: 8, createdDaysAgo: 35, assigneeEmail: 'youredik@gmail.com' },
  { num: 12, title: 'DMN таблицы решений', status: 'done', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 30, assigneeEmail: 'youredik@gmail.com' },

  // ═══ В разработке (5) ═══
  { num: 13, title: 'Process Mining: аналитика и визуализация', status: 'in_development', priority: 'high', taskType: 'feature', storyPoints: 8, createdDaysAgo: 21, assigneeEmail: 'youredik@gmail.com' },
  { num: 14, title: 'Дашборды с графиками и метриками', status: 'in_development', priority: 'medium', taskType: 'feature', storyPoints: 8, createdDaysAgo: 18, assigneeEmail: 'youredik@gmail.com' },
  { num: 15, title: 'Мобильная адаптация интерфейса', status: 'in_development', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 14, assigneeEmail: 'youredik@gmail.com' },
  { num: 16, title: 'User tasks: Inbox и формы задач', status: 'in_development', priority: 'high', taskType: 'feature', storyPoints: 13, createdDaysAgo: 10, assigneeEmail: 'youredik@gmail.com' },
  { num: 17, title: 'Связи между сущностями (Entity Links)', status: 'in_development', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 7, assigneeEmail: 'youredik@gmail.com' },

  // ═══ Code Review (2) ═══
  { num: 18, title: 'E2E тесты: Playwright + автоочистка', status: 'code_review', priority: 'high', taskType: 'infrastructure', storyPoints: 8, createdDaysAgo: 5, assigneeEmail: 'youredik@gmail.com' },
  { num: 19, title: 'Оптимизация канбана: серверная пагинация по колонкам', status: 'code_review', priority: 'medium', taskType: 'refactor', storyPoints: 5, createdDaysAgo: 3, assigneeEmail: 'youredik@gmail.com' },

  // ═══ Тестирование (2) ═══
  { num: 20, title: 'Автоматизация рабочих процессов (Automation Rules)', status: 'testing', priority: 'high', taskType: 'feature', storyPoints: 8, createdDaysAgo: 10, assigneeEmail: 'youredik@gmail.com' },
  { num: 21, title: 'Полнотекстовый поиск с tsvector', status: 'testing', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 5, assigneeEmail: 'youredik@gmail.com' },

  // ═══ Backlog (4) ═══
  { num: 22, title: 'Push уведомления (Web Push API)', status: 'backlog', priority: 'low', taskType: 'feature', storyPoints: 5, createdDaysAgo: 3, assigneeEmail: 'youredik@gmail.com' },
  { num: 23, title: 'Экспорт отчётов в PDF и Excel', status: 'backlog', priority: 'medium', taskType: 'feature', storyPoints: 5, createdDaysAgo: 2, assigneeEmail: 'youredik@gmail.com' },
  { num: 24, title: 'Интеграция с Telegram-ботом', status: 'backlog', priority: 'medium', taskType: 'feature', storyPoints: 8, createdDaysAgo: 2, assigneeEmail: 'youredik@gmail.com' },
  { num: 25, title: 'Белая метка (white label) для клиентов', status: 'backlog', priority: 'low', taskType: 'feature', storyPoints: 13, createdDaysAgo: 1, assigneeEmail: 'youredik@gmail.com' },
];

// ─── Комментарии ─────────────────────────────────────────────────────────────

const ED = 'youredik@gmail.com';
const SM = 'korshunovsm@yandex.ru';

const COMMENTS: Record<number, CommentDef[]> = {
  // DEV-1: Инициализация проекта
  1: [
    { authorEmail: SM, text: 'Эд, давай начнём с базовой структуры проекта. Нужен монорепо с фронтом на Next.js и бэкендом на NestJS. Хочу npm workspaces, чтобы общие типы шарить.', offsetDays: 0 },
    { authorEmail: ED, text: 'Принял. Сделаю через npm workspaces. Структура: apps/frontend + apps/backend. TypeScript strict mode, ESLint + Prettier сразу подключу.', offsetDays: 1 },
    { authorEmail: SM, text: 'Добавь сразу Docker Compose для PostgreSQL и базовый CI через GitHub Actions.', offsetDays: 2 },
    { authorEmail: ED, text: 'Готово. Настроил docker-compose.yml (PG 16 + pgAdmin), CI на push в develop. Линтер + тайпчек в пайплайне. Ещё добавил pgvector расширение — пригодится для AI фичей потом.', offsetDays: 4 },
    { authorEmail: SM, text: 'Отлично, фундамент есть. Закрываю.', offsetDays: 5 },
  ],

  // DEV-2: Keycloak SSO
  2: [
    { authorEmail: SM, text: 'Авторизация — приоритет номер один. У нас Keycloak на new.stankoff.ru, realm stankoff-preprod. Нужен SSO с refresh token в HttpOnly cookie.', offsetDays: 0 },
    { authorEmail: ED, text: 'Понял. Сделаю OAuth2 flow: redirect на Keycloak → callback → JWT. Access token в памяти (Zustand), refresh в cookie. Плюс dev mode для локальной разработки без Keycloak.', offsetDays: 1 },
    { authorEmail: SM, text: 'Dev mode — отличная идея. Можно будет карточки пользователей показывать для быстрого входа?', offsetDays: 2 },
    { authorEmail: ED, text: 'Да, при AUTH_DEV_MODE=true на /login отображаются карточки всех users из БД, клик — вход. На проде флаг выключен, всё идёт через Keycloak.', offsetDays: 3 },
    { authorEmail: SM, text: 'Важно: realm stankoff — это другой проект, его трогать НЕЛЬЗЯ. Только stankoff-preprod.', offsetDays: 4 },
    { authorEmail: ED, text: 'Зафиксировал. В конфиге прописан только stankoff-preprod. Ещё сделал кастомную тему для Keycloak в корпоративном стиле с бирюзовыми акцентами.', offsetDays: 6 },
    { authorEmail: SM, text: 'Проверил — всё работает. Редирект, callback, refresh token обновляется корректно. Закрываю.', offsetDays: 8 },
  ],

  // DEV-3: CRUD сущностей
  3: [
    { authorEmail: SM, text: 'Нужен базовый CRUD для заявок (entities) и workspace\'ов. Workspace — это контейнер с настройками полей и статусов. Entities — заявки внутри.', offsetDays: 0 },
    { authorEmail: ED, text: 'Сделаю entities с JSONB для кастомных полей (data). Статусы определяются в конфиге workspace через sections[].fields[]. Каждый workspace имеет префикс для customId (напр. TP-1, REK-2).', offsetDays: 1 },
    { authorEmail: SM, text: 'Правильно. Ещё нужен assignee — назначение ответственного на заявку. И приоритеты: low, medium, high, critical.', offsetDays: 3 },
    { authorEmail: ED, text: 'Реализовал. PATCH /entities/:id/status, PATCH /entities/:id/assignee — отдельные endpoint\'ы для быстрого обновления. Приоритет хранится как строка, фильтрация по нему в query params.', offsetDays: 5 },
    { authorEmail: SM, text: 'Нужны ещё workspace members с ролями: viewer, editor, admin.', offsetDays: 6 },
    { authorEmail: ED, text: 'Готово. WorkspaceMember entity с enum WorkspaceRole. Admin может менять настройки и участников, editor — редактировать заявки, viewer — только смотреть.', offsetDays: 8 },
    { authorEmail: SM, text: 'Протестировал, всё ок. Можно двигаться к UI.', offsetDays: 10 },
  ],

  // DEV-4: Канбан-доска
  4: [
    { authorEmail: SM, text: 'Канбан-доска — ключевой вид. Колонки = статусы из конфига workspace. Drag-and-drop карточек между колонками. Хочу чтобы было плавно, как в Trello.', offsetDays: 0 },
    { authorEmail: ED, text: 'Возьму @dnd-kit — лучшая либа для React DnD на данный момент. Поддерживает touch, keyboard accessibility, плавные анимации. Сортировка внутри колонки + перетаскивание между колонками.', offsetDays: 1 },
    { authorEmail: SM, text: 'При перетаскивании карточки статус должен обновляться сразу, оптимистично.', offsetDays: 2 },
    { authorEmail: ED, text: 'Да, оптимистичный update через Zustand + PATCH /entities/:id/status на бэке. Если сервер вернёт ошибку — откатываем. Плюс WebSocket событие status:changed для других пользователей.', offsetDays: 3 },
    { authorEmail: SM, text: 'Выглядит здорово! Единственное — карточки нужно сделать компактнее, чтобы больше помещалось в колонку.', offsetDays: 5 },
    { authorEmail: ED, text: 'Ок, уменьшил padding, приоритет показываю цветной полоской слева вместо бейджа. Assignee — аватарка в правом нижнем углу.', offsetDays: 6 },
    { authorEmail: SM, text: 'Идеально. Закрываю задачу.', offsetDays: 7 },
  ],

  // DEV-5: Таблица
  5: [
    { authorEmail: SM, text: 'Помимо канбана нужно табличное представление. Пагинация, сортировка по любому полю, фильтры.', offsetDays: 0 },
    { authorEmail: ED, text: 'Сделаю серверную пагинацию (page + perPage) и сортировку (sortBy + sortOrder). Фильтры: search, assigneeId[], priority[], status[], dateFrom/dateTo.', offsetDays: 1 },
    { authorEmail: SM, text: 'Переключение между канбаном и таблицей должно сохранять фильтры.', offsetDays: 2 },
    { authorEmail: ED, text: 'Реализовал через URL search params. Фильтры синхронизируются с URL, при переключении вида сохраняются. Готово, можешь тестить.', offsetDays: 4 },
    { authorEmail: SM, text: 'Работает. Вопрос — можно добавить выбор видимых колонок?', offsetDays: 5 },
    { authorEmail: ED, text: 'Добавил. Настройки видимости колонок сохраняются в localStorage по workspace.', offsetDays: 6 },
  ],

  // DEV-6: Rich-text комментарии
  6: [
    { authorEmail: SM, text: 'Комментарии к заявкам. Нужен rich-text редактор: bold, italic, списки, ссылки. Плюс @mentions пользователей.', offsetDays: 0 },
    { authorEmail: ED, text: 'Буду использовать Tiptap — это headless редактор на ProseMirror, хорошо кастомизируется. Mentions через extension @tiptap/extension-mention.', offsetDays: 1 },
    { authorEmail: SM, text: 'А вложения? Картинки, документы?', offsetDays: 2 },
    { authorEmail: ED, text: 'Файлы загружаю через POST /files/upload в Yandex Object Storage (S3-compatible). В комменте хранится массив attachments с метаданными. Превью картинок генерирую на лету.', offsetDays: 3 },
    { authorEmail: SM, text: 'Круто. Ещё нужен OG-preview для ссылок.', offsetDays: 4 },
    { authorEmail: ED, text: 'Сделал endpoint GET /og-preview?url=... — парсит meta-теги и возвращает title, description, image. На фронте рендерю карточку-превью под ссылкой.', offsetDays: 5 },
  ],

  // DEV-7: WebSocket
  7: [
    { authorEmail: SM, text: 'Нужен real-time: когда один пользователь меняет статус или пишет коммент — другие видят сразу, без перезагрузки.', offsetDays: 0 },
    { authorEmail: ED, text: 'Socket.IO через EventsGateway. События: entity:created, entity:updated, status:changed, comment:created, user:assigned. Подписка по workspaceId.', offsetDays: 1 },
    { authorEmail: SM, text: 'А что с авторизацией WebSocket? Токен может протухнуть.', offsetDays: 2 },
    { authorEmail: ED, text: 'Сделал auth:refresh событие — клиент шлёт новый JWT, сервер обновляет контекст без разрыва соединения. Плюс presence:update для списка онлайн-пользователей.', offsetDays: 3 },
    { authorEmail: SM, text: 'Протестировал в двух вкладках — коммент появляется мгновенно. Работает!', offsetDays: 5 },
  ],

  // DEV-8: BPMN / Camunda
  8: [
    { authorEmail: SM, text: 'Это самая крупная фича. Нужен полноценный BPMN движок: моделирование процессов, деплой в Zeebe, запуск экземпляров, user tasks. Бизнес хочет автоматизировать сервисные заявки и продажи.', offsetDays: 0 },
    { authorEmail: ED, text: 'Буду интегрировать Camunda 8 (Zeebe gRPC). На фронте — bpmn-js для моделирования. На бэке — @camunda8/sdk для деплоя и управления процессами. Workers для сервисных задач.', offsetDays: 1 },
    { authorEmail: SM, text: 'Какие worker\'ы нужны?', offsetDays: 3 },
    { authorEmail: ED, text: 'Минимум: update-entity-status (меняет статус заявки), send-notification (WebSocket), log-activity (логирование), set-assignee (назначение), process-completed (финализация). Плюс io.camunda.zeebe:userTask для пользовательских задач.', offsetDays: 4 },
    { authorEmail: SM, text: 'User tasks — это как inbox, да? Пользователь видит список задач, заполняет форму, нажимает "Выполнить"?', offsetDays: 5 },
    { authorEmail: ED, text: 'Именно. User task worker использует job.forward() + отложенное завершение (timeout 30 дней). Когда пользователь завершает задачу через UI — completeUserTaskJob(). Формы определяются через form definitions.', offsetDays: 7 },
    { authorEmail: SM, text: 'Ещё нужны триггеры — чтобы процесс запускался автоматически при определённых событиях.', offsetDays: 9 },
    { authorEmail: ED, text: 'Сделал процессные триггеры: при создании заявки, при смене статуса, по webhook. Webhook поддерживает HMAC-SHA256 подпись. Триггер можно включать/выключать.', offsetDays: 11 },
  ],

  // DEV-9: Legacy миграция
  9: [
    { authorEmail: SM, text: 'Критическая задача — нужно мигрировать все данные из legacy CRM. Там порядка 350К заявок. MariaDB на 185.186.143.38, доступ только с IP препрода.', offsetDays: 0 },
    { authorEmail: ED, text: 'Посмотрел структуру legacy БД. Основные таблицы: QD_requests и QD_answers. Но там был рефакторинг — таблицы переименованы: QD_managers → manager, QD_departments → department. Поля тоже изменились: answer → text, customerID → UID.', offsetDays: 1 },
    { authorEmail: SM, text: 'Какие сроки? Важно не потерять ни одной заявки.', offsetDays: 3 },
    { authorEmail: ED, text: 'Реализовал batch-импорт с чанками по 500 записей. Полная миграция занимает ~36 минут. 356,380 заявок + 2,213,253 комментариев. Всё в workspace "Legacy CRM (Миграция)", prefix LEG.', offsetDays: 5 },
    { authorEmail: SM, text: 'Ошибки?', offsetDays: 6 },
    { authorEmail: ED, text: '0.16% — в основном из-за невалидных кодировок в старых записях. Все ошибки залогированы, можно повторить через retry endpoint. Маппинг assignee: manager.id → manager.userId → employeeMap → User.id.', offsetDays: 7 },
    { authorEmail: SM, text: 'Давай добавим автоматическую синхронизацию каждые 5 минут для новых данных.', offsetDays: 8 },
    { authorEmail: ED, text: 'Сделал cron-синхронизацию. POST /api/legacy/sync/enable включает, каждые 5 мин проверяет новые заявки. POST /api/legacy/sync/run-now — ручной запуск. Валидация целостности — POST /legacy/migration/validate.', offsetDays: 10 },
  ],

  // DEV-10: AI классификация
  10: [
    { authorEmail: SM, text: 'Хочу AI-классификацию заявок: автоматически определять категорию, приоритет и нужные навыки. Бесплатно если возможно.', offsetDays: 0 },
    { authorEmail: ED, text: 'Есть план: YandexGPT для LLM (нативный русский, без гео-блокировки) и Yandex Embeddings (text-search-doc, 256 dims). RAG поиск по базе знаний из legacy данных.', offsetDays: 1 },
    { authorEmail: SM, text: 'RAG — это semantic search по закрытым заявкам?', offsetDays: 2 },
    { authorEmail: ED, text: 'Да. Индексирую закрытые заявки с ответами через pgvector. При новой заявке — ищу похожие, подсовываю LLM как контекст. Результат: категория, приоритет 1-5, список навыков, рекомендуемый ответ.', offsetDays: 3 },
    { authorEmail: SM, text: 'А BPMN worker для автоклассификации?', offsetDays: 4 },
    { authorEmail: ED, text: 'Сделал classify-entity worker. В BPMN процессе можно добавить service task с типом classify-entity — при срабатывании запускает AI классификацию и сохраняет результат в entity.data. WebSocket событие ai:classification:ready уведомляет UI.', offsetDays: 6 },
    { authorEmail: SM, text: 'Крутой результат. Попробовал — для сервисных заявок определяет категорию правильно в ~80% случаев.', offsetDays: 8 },
  ],

  // DEV-11: SLA
  11: [
    { authorEmail: SM, text: 'SLA мониторинг: для каждого workspace можно задать правила (напр. первый ответ за 2 часа, решение за 24 часа). Если просрочено — уведомление.', offsetDays: 0 },
    { authorEmail: ED, text: 'SLA definitions привязаны к workspace. Каждый SLA instance трекает таймер: pending → active → paused → breached/met. События SLA: start, pause, resume, breach, meet.', offsetDays: 1 },
    { authorEmail: SM, text: 'Нужна пауза SLA, когда заявка в статусе ожидания ответа клиента.', offsetDays: 2 },
    { authorEmail: ED, text: 'Реализовал. POST /sla/instances/:id/pause и /resume. Пауза останавливает таймер, при resume — продолжает с того же места. Дашборд: GET /sla/dashboard?workspaceId=...', offsetDays: 4 },
    { authorEmail: SM, text: 'Отлично. В дашборде видны просроченные и скоро просрочатся — удобно.', offsetDays: 5 },
  ],

  // DEV-12: DMN таблицы решений
  12: [
    { authorEmail: SM, text: 'Нужны таблицы решений (DMN): бизнес-пользователи задают правила "если X, то Y" без кода. Например: если сумма > 1M и категория = станки → приоритет critical.', offsetDays: 0 },
    { authorEmail: ED, text: 'Сделаю движок DMN с hit policies: FIRST, UNIQUE, ANY, COLLECT, RULE_ORDER. UI — редактируемая таблица с условиями (inputs) и результатами (outputs).', offsetDays: 1 },
    { authorEmail: SM, text: 'Нужно логирование каждого вычисления — чтобы видеть какое правило сработало.', offsetDays: 2 },
    { authorEmail: ED, text: 'Да, POST /dmn/evaluate логирует каждый вызов. GET /dmn/tables/:id/evaluations — история. GET /dmn/tables/:id/statistics — статистика: какие правила срабатывают чаще, какие не использовались.', offsetDays: 3 },
    { authorEmail: SM, text: 'Ещё клонирование таблиц было бы удобно — чтобы не создавать с нуля.', offsetDays: 4 },
    { authorEmail: ED, text: 'POST /dmn/tables/:id/clone — готово. Копирует все правила, создаёт новую таблицу с суффиксом "(копия)".', offsetDays: 5 },
  ],

  // DEV-13: Process Mining (in progress)
  13: [
    { authorEmail: SM, text: 'Нужна аналитика по BPMN процессам. Хочу видеть: среднее время на каждом шаге, bottleneck\'и, тепловую карту.', offsetDays: 0 },
    { authorEmail: ED, text: 'Реализую через materialized views. Endpoint\'ы: stats, time-analysis, element-stats (для heat map на BPMN диаграмме). Обновление view каждые 5 минут через AnalyticsService.refreshMaterializedViews().', offsetDays: 2 },
    { authorEmail: SM, text: 'Можно добавить фильтрацию по периоду?', offsetDays: 4 },
    { authorEmail: ED, text: 'Да, добавлю query параметры dateFrom/dateTo. Сейчас работаю над визуализацией на фронте — bpmn-js + кастомный overlay для отображения времени и количества на каждом элементе.', offsetDays: 6 },
    { authorEmail: SM, text: 'Покажешь когда будет готова визуализация? Хочу показать руководству.', offsetDays: 8 },
    { authorEmail: ED, text: 'Бэкенд готов: 4 endpoint\'а. Фронт — делаю overlay на bpmn-js, цветовая шкала от зелёного (быстро) до красного (bottleneck). Думаю ещё пару дней.', offsetDays: 10 },
  ],

  // DEV-14: Дашборды
  14: [
    { authorEmail: SM, text: 'Дашборды: сводная информация по workspace — количество заявок по статусам, динамика за период, топ исполнителей, среднее время решения.', offsetDays: 0 },
    { authorEmail: ED, text: 'Materialized views уже есть: mv_workspace_stats, mv_assignee_stats, mv_daily_activity. На фронте буду использовать Recharts для графиков.', offsetDays: 1 },
    { authorEmail: SM, text: 'Хотелось бы виджеты: можно перетаскивать и настраивать какие данные показывать.', offsetDays: 3 },
    { authorEmail: ED, text: 'Это уже dashboard builder получается. Пока сделаю фиксированный набор виджетов, а кастомизацию вынесем в отдельную задачу. Ок?', offsetDays: 4 },
    { authorEmail: SM, text: 'Да, давай так. Фиксированный набор для начала достаточно.', offsetDays: 5 },
  ],

  // DEV-15: Мобильная адаптация
  15: [
    { authorEmail: SM, text: 'Бизнес жалуется, что на мобильниках неудобно. Сервисные инженеры часто работают с планшета в полях.', offsetDays: 0 },
    { authorEmail: ED, text: 'Tailwind responsive классы уже используются, но нужна серьёзная доработка: боковое меню → bottom nav на mobile, канбан → вертикальный скролл, таблица → карточки.', offsetDays: 1 },
    { authorEmail: SM, text: 'Канбан на мобильном — может лучше показывать одну колонку с переключателем?', offsetDays: 3 },
    { authorEmail: ED, text: 'Хорошая идея. Сделаю swipe между колонками + табы сверху с количеством. Начал с sidebar — на mobile он становится sheet снизу.', offsetDays: 5 },
    { authorEmail: SM, text: 'Как дела с прогрессом?', offsetDays: 8 },
    { authorEmail: ED, text: 'Sidebar и навигация готовы. Сейчас адаптирую детальный вид заявки и комментарии. Канбан со swipe — следующий шаг.', offsetDays: 9 },
  ],

  // DEV-16: User Tasks Inbox
  16: [
    { authorEmail: SM, text: 'Inbox для user tasks: список задач назначенных пользователю из BPMN процессов. Claim, unclaim, complete, delegate. Массовые операции.', offsetDays: 0 },
    { authorEmail: ED, text: 'API готов: GET /bpmn/tasks/inbox с пагинацией, POST batch/claim, batch/delegate. На фронте — таблица с фильтрами + детальный вид с формой.', offsetDays: 2 },
    { authorEmail: SM, text: 'Формы для задач — откуда берутся?', offsetDays: 3 },
    { authorEmail: ED, text: 'Из form definitions. В BPMN шаблоне user task ссылается на formId. GET /bpmn/forms/:id возвращает JSON-схему формы, фронт рендерит динамически.', offsetDays: 4 },
    { authorEmail: SM, text: 'Нужны ещё напоминания о дедлайне.', offsetDays: 5 },
    { authorEmail: ED, text: 'WebSocket события: task:reminder (за 1 час до дедлайна) и task:overdue (просрочена). Проверка каждые 5 минут через cron job.', offsetDays: 6 },
  ],

  // DEV-17: Entity Links
  17: [
    { authorEmail: SM, text: 'Связи между заявками: "блокирует", "связана с", "дочерняя". Нужно видеть граф связей.', offsetDays: 0 },
    { authorEmail: ED, text: 'Модель: entity_links таблица с sourceId, targetId, linkType. API: POST /bpmn/entity-links для создания связи, POST /bpmn/entity-links/spawn — создать новую сущность и сразу связать.', offsetDays: 1 },
    { authorEmail: SM, text: 'Spawn — это чтобы из заявки можно было создать подзадачу?', offsetDays: 2 },
    { authorEmail: ED, text: 'Именно. Например, из рекламационной заявки создаёшь задачу на выезд инженера — автоматически связываются. На фронте в детальном виде заявки покажу секцию "Связанные".', offsetDays: 3 },
    { authorEmail: SM, text: 'Хорошо, давай. Только linkType сделай enum — чтобы не было мусорных значений.', offsetDays: 4 },
  ],

  // DEV-18: E2E тесты
  18: [
    { authorEmail: SM, text: 'Нужны E2E тесты. Перед каждым деплоем хочу быть уверен, что основные сценарии работают.', offsetDays: 0 },
    { authorEmail: ED, text: 'Playwright — лучший выбор для E2E. Настроил: global-setup создаёт тестовые данные, global-teardown чистит. Маркеры в названиях (Playwright, Тест, DnD) для безопасной очистки.', offsetDays: 1 },
    { authorEmail: SM, text: 'Какие сценарии покрыты?', offsetDays: 2 },
    { authorEmail: ED, text: 'Пока: логин, создание workspace, создание entity, канбан DnD, комментарии, фильтрация, поиск. Запуск: npm run test:e2e. Ещё есть headed режим для отладки.', offsetDays: 3 },
    { authorEmail: SM, text: 'В CI тоже должны запускаться.', offsetDays: 3 },
    { authorEmail: ED, text: 'Да, в GitHub Actions job: frontend-tests запускает Playwright в headless. Артефакты (screenshots, videos) сохраняются при падении.', offsetDays: 4 },
  ],

  // DEV-19: Оптимизация канбана
  19: [
    { authorEmail: SM, text: 'Канбан тормозит когда в workspace 1000+ заявок. Нужна оптимизация.', offsetDays: 0 },
    { authorEmail: ED, text: 'Проблема понятна — загружаем все entities разом. Решение: серверная пагинация по колонкам. GET /entities/kanban?perColumn=20, отдельный endpoint GET /entities/kanban/column для подгрузки.', offsetDays: 1 },
    { authorEmail: SM, text: 'А infinite scroll внутри колонки?', offsetDays: 1 },
    { authorEmail: ED, text: 'Да, IntersectionObserver на последней карточке в колонке. При скролле вниз — загружаем следующую порцию. offset + limit. На legacy workspace с 356К записей работает плавно.', offsetDays: 2 },
  ],

  // DEV-20: Automation Rules
  20: [
    { authorEmail: SM, text: 'Автоматизация: правила типа "при создании заявки с приоритетом critical — назначить на Андрея Кяшкина и отправить уведомление".', offsetDays: 0 },
    { authorEmail: ED, text: 'Модель: automation_rules с conditions (JSON) и actions (JSON). Trigger: on_create, on_status_change, on_field_change. Actions: set_assignee, set_status, send_notification, start_process.', offsetDays: 2 },
    { authorEmail: SM, text: 'Правила должны выполняться в определённом порядке?', offsetDays: 3 },
    { authorEmail: ED, text: 'Да, поле order определяет порядок. Правила выполняются последовательно, каждое может модифицировать entity, и следующее работает с обновлёнными данными.', offsetDays: 4 },
    { authorEmail: SM, text: 'Сейчас на тестировании — проверяю сценарии с сервисным отделом.', offsetDays: 7 },
    { authorEmail: ED, text: 'Ок, дай знать если найдёшь баги. Логи каждого срабатывания можно смотреть через API.', offsetDays: 8 },
  ],

  // DEV-21: Полнотекстовый поиск
  21: [
    { authorEmail: SM, text: 'Поиск по всем заявкам и комментариям. Быстрый, с учётом русской морфологии.', offsetDays: 0 },
    { authorEmail: ED, text: 'PostgreSQL tsvector + триггеры. Колонка searchVector автоматически обновляется при INSERT/UPDATE. Конфигурация: russian для русского текста. GIN индекс для быстрого поиска.', offsetDays: 1 },
    { authorEmail: SM, text: 'API?', offsetDays: 1 },
    { authorEmail: ED, text: 'GET /search?q=текст — глобальный поиск. Отдельно: /search/entities и /search/comments. С подсветкой совпадений через ts_headline.', offsetDays: 2 },
    { authorEmail: SM, text: 'Скорость?', offsetDays: 3 },
    { authorEmail: ED, text: 'На 356К записей — 50-200ms. GIN индекс делает своё дело. Тестирую на препроде, пока всё стабильно.', offsetDays: 4 },
  ],

  // DEV-22: Push уведомления (backlog)
  22: [
    { authorEmail: SM, text: 'Web Push уведомления: когда пользователь не на сайте — показывать браузерное уведомление о новом комменте или назначении.', offsetDays: 0 },
    { authorEmail: ED, text: 'Понял. Нужен Service Worker + Web Push API + VAPID ключи. На бэке — web-push библиотека. Подписка хранится в БД для каждого устройства.', offsetDays: 0 },
    { authorEmail: SM, text: 'Пока в бэклоге, приоритет низкий. Но хорошо бы сделать до запуска production.', offsetDays: 1 },
  ],

  // DEV-23: Экспорт отчётов (backlog)
  23: [
    { authorEmail: SM, text: 'Руководство хочет выгружать отчёты: список заявок в Excel, аналитику в PDF. Фильтры должны применяться.', offsetDays: 0 },
    { authorEmail: ED, text: 'Для Excel — exceljs, для PDF — puppeteer или pdfmake. Endpoint: POST /export с параметрами фильтрации и format: xlsx/pdf.', offsetDays: 0 },
    { authorEmail: SM, text: 'Фоновая генерация? Большие отчёты могут быть долгими.', offsetDays: 1 },
    { authorEmail: ED, text: 'Да, для больших объёмов — Bull queue. Пользователь получает уведомление когда файл готов. Для маленьких — синхронно с потоковой передачей.', offsetDays: 1 },
  ],

  // DEV-24: Telegram-бот (backlog)
  24: [
    { authorEmail: SM, text: 'Telegram-бот: уведомления о новых заявках и комментах, быстрые ответы прямо из Telegram, смена статуса.', offsetDays: 0 },
    { authorEmail: ED, text: 'Telegraf.js для бота. Привязка Telegram userId к нашему User через команду /link. Уведомления из EventsGateway → Telegram API. Inline кнопки для смены статуса.', offsetDays: 0 },
    { authorEmail: SM, text: 'Можно ещё создание заявок через бота? Отправляешь сообщение — создаётся заявка.', offsetDays: 1 },
    { authorEmail: ED, text: 'Да, forward сообщения клиента → бот парсит текст → создаёт entity в указанном workspace. Можно будет и фото отправлять как вложение.', offsetDays: 1 },
  ],

  // DEV-25: White label (backlog)
  25: [
    { authorEmail: SM, text: 'На будущее: белая метка. Чтобы можно было развернуть портал для других компаний с их логотипом, цветами и доменом.', offsetDays: 0 },
    { authorEmail: ED, text: 'Понял масштаб. Нужно: CSS custom properties для цветовой схемы, конфиг файл с логотипами/названиями, multi-tenant архитектура (по домену или по tenant_id).', offsetDays: 0 },
    { authorEmail: SM, text: 'Multi-tenant — это отдельные БД или одна с tenant_id?', offsetDays: 1 },
    { authorEmail: ED, text: 'Для начала — schema-per-tenant в одной БД. Каждый tenant получает свой PostgreSQL schema. Это проще отдельных БД, но даёт изоляцию. Миграции применяются ко всем schema.', offsetDays: 1 },
    { authorEmail: SM, text: 'Хорошо продумано. Это задача на перспективу, пока оставим в бэклоге.', offsetDays: 1 },
  ],
};

// ─── Workspace конфиг ────────────────────────────────────────────────────────

const WORKSPACE_SECTIONS = [
  {
    id: 'main',
    name: 'Основное',
    order: 0,
    fields: [
      {
        id: 'title',
        name: 'Название',
        type: 'text' as const,
        required: true,
      },
      {
        id: 'status',
        name: 'Статус',
        type: 'status' as const,
        options: [
          { id: 'backlog', label: 'Backlog', color: '#94a3b8' },
          { id: 'in_development', label: 'В разработке', color: '#3b82f6' },
          { id: 'code_review', label: 'Code Review', color: '#a855f7' },
          { id: 'testing', label: 'Тестирование', color: '#f59e0b' },
          { id: 'done', label: 'Готово', color: '#22c55e' },
        ],
      },
      {
        id: 'priority',
        name: 'Приоритет',
        type: 'select' as const,
        options: [
          { id: 'low', label: 'Низкий', color: '#94a3b8' },
          { id: 'medium', label: 'Средний', color: '#3b82f6' },
          { id: 'high', label: 'Высокий', color: '#f59e0b' },
          { id: 'critical', label: 'Критический', color: '#ef4444' },
        ],
      },
      {
        id: 'assignee',
        name: 'Исполнитель',
        type: 'user' as const,
      },
    ],
  },
  {
    id: 'details',
    name: 'Детали',
    order: 1,
    fields: [
      {
        id: 'task_type',
        name: 'Тип задачи',
        type: 'select' as const,
        options: [
          { id: 'feature', label: 'Фича', color: '#3b82f6' },
          { id: 'bug', label: 'Баг', color: '#ef4444' },
          { id: 'refactor', label: 'Рефакторинг', color: '#a855f7' },
          { id: 'docs', label: 'Документация', color: '#22c55e' },
          { id: 'infrastructure', label: 'Инфраструктура', color: '#f59e0b' },
        ],
      },
      {
        id: 'sprint',
        name: 'Спринт',
        type: 'text' as const,
      },
      {
        id: 'story_points',
        name: 'Story Points',
        type: 'number' as const,
      },
    ],
  },
];

// ─── Сервис ──────────────────────────────────────────────────────────────────

@Injectable()
export class SeedItDepartmentService {
  private readonly logger = new Logger(SeedItDepartmentService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly wsRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepo: Repository<WorkspaceEntity>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
  ) {}

  /**
   * Создать IT workspace с 25 задачами и комментариями.
   */
  async createAll(
    users: User[],
    itSection: Section,
  ): Promise<{ workspace: Workspace; entities: WorkspaceEntity[] }> {
    const youredik = users.find((u) => u.email === 'youredik@gmail.com')!;
    const korshunov = users.find((u) => u.email === 'korshunovsm@yandex.ru')!;

    if (!youredik || !korshunov) {
      throw new Error(
        'SeedItDepartment: не найдены пользователи youredik или korshunov',
      );
    }

    // 1. Workspace
    const workspace = await this.createWorkspace(itSection);

    // 2. Members
    await this.createMembers(workspace, youredik, korshunov);

    // 3. Entities (25 задач)
    const entities = await this.createEntities(workspace, users);

    // 4. Comments
    await this.createComments(entities, users);

    this.logger.log(
      `IT Workspace создан: ${entities.length} задач с комментариями`,
    );

    return { workspace, entities };
  }

  // ─── Workspace ───────────────────────────────────────────────────────────

  private async createWorkspace(itSection: Section): Promise<Workspace> {
    const ws = this.wsRepo.create({
      name: 'Разработка Stankoff Portal',
      icon: '💻',
      prefix: 'DEV',
      lastEntityNumber: 25,
      sectionId: itSection.id,
      showInMenu: true,
      orderInSection: 0,
      sections: WORKSPACE_SECTIONS,
    });
    return this.wsRepo.save(ws);
  }

  // ─── Members ─────────────────────────────────────────────────────────────

  private async createMembers(
    workspace: Workspace,
    youredik: User,
    korshunov: User,
  ): Promise<void> {
    const members = [
      this.memberRepo.create({
        workspaceId: workspace.id,
        userId: youredik.id,
        role: WorkspaceRole.ADMIN,
      }),
      this.memberRepo.create({
        workspaceId: workspace.id,
        userId: korshunov.id,
        role: WorkspaceRole.ADMIN,
      }),
    ];
    await this.memberRepo.save(members);
  }

  // ─── Entities ────────────────────────────────────────────────────────────

  private async createEntities(
    workspace: Workspace,
    users: User[],
  ): Promise<WorkspaceEntity[]> {
    const entities: WorkspaceEntity[] = [];

    for (const task of TASKS) {
      const assignee = users.find((u) => u.email === task.assigneeEmail);
      const createdAt = daysAgo(task.createdDaysAgo);

      // resolvedAt для завершённых задач
      let resolvedAt: Date | undefined;
      if (task.status === 'done') {
        // Завершены через 5-15 дней после создания
        const resolveDays = Math.max(
          1,
          task.createdDaysAgo - Math.floor(5 + Math.random() * 10),
        );
        resolvedAt = daysAgo(resolveDays);
      }

      const entity = this.entityRepo.create({
        workspaceId: workspace.id,
        customId: `DEV-${task.num}`,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeId: assignee?.id ?? null,
        data: {
          task_type: task.taskType,
          story_points: task.storyPoints,
        },
        createdAt,
        updatedAt: resolvedAt ?? daysAgo(Math.max(0, task.createdDaysAgo - 2)),
        lastActivityAt: resolvedAt ?? daysAgo(Math.max(0, task.createdDaysAgo - 1)),
        resolvedAt,
      });

      entities.push(entity);
    }

    return this.entityRepo.save(entities);
  }

  // ─── Comments ────────────────────────────────────────────────────────────

  private async createComments(
    entities: WorkspaceEntity[],
    users: User[],
  ): Promise<void> {
    const usersByEmail = new Map<string, User>();
    for (const u of users) {
      usersByEmail.set(u.email, u);
    }

    const allComments: Comment[] = [];

    for (const entity of entities) {
      const taskNum = parseInt(entity.customId.replace('DEV-', ''), 10);
      const commentDefs = COMMENTS[taskNum];
      if (!commentDefs) continue;

      for (const cDef of commentDefs) {
        const author = usersByEmail.get(cDef.authorEmail);
        if (!author) continue;

        const createdAt = new Date(entity.createdAt);
        createdAt.setDate(createdAt.getDate() + cDef.offsetDays);
        // Добавляем случайные часы для реалистичности
        createdAt.setHours(9 + Math.floor(Math.random() * 9)); // 9:00 — 17:59
        createdAt.setMinutes(Math.floor(Math.random() * 60));

        const comment = this.commentRepo.create({
          entityId: entity.id,
          authorId: author.id,
          content: cDef.text,
          createdAt,
          updatedAt: createdAt,
        });
        allComments.push(comment);
      }
    }

    // Сохраняем чанками по 100
    const chunkSize = 100;
    for (let i = 0; i < allComments.length; i += chunkSize) {
      const chunk = allComments.slice(i, i + chunkSize);
      await this.commentRepo.save(chunk);
    }

    this.logger.log(`  Создано ${allComments.length} комментариев к IT задачам`);
  }
}
