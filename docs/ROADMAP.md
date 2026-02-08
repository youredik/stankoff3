# Roadmap до Production

**Дата создания:** 2026-02-03
**Обновлено:** 2026-02-08
**Планируемый запуск:** ~1 месяц

---

## Неделя 1-2: Функциональность

- [x] Доделать основные фичи (BPMN, SLA, DMN, Legacy, AI, Field System)
- [ ] Настроить E2E тесты с Keycloak (или mock auth)
- [x] Задеплоить на preprod и проверить миграции
- [x] Тестирование поиска и новых полей

## Неделя 3: Стабилизация

- [ ] Исправить найденные баги
- [x] Проверить что всё работает на preprod
- [ ] Настроить Sentry для мониторинга ошибок
- [ ] Нагрузочное тестирование (опционально)

## Неделя 4: Подготовка к Production

- [ ] Настроить автоматические бэкапы БД (S3)
- [ ] Настроить cron для materialized views (каждые 5 мин)
- [x] Проверить SSL и security headers
- [ ] Production deployment pipeline
- [ ] Документация для операторов

---

## Выполненные оптимизации БД

### ✅ Инфраструктура миграций
- `synchronize: false` везде
- `migrationsRun: true` — автозапуск при старте
- Скрипты: `migration:generate`, `migration:run`, `migration:revert`

### ✅ Индексы для аналитики
- B-tree: workspace+status, workspace+created, workspace+assignee
- GIN: data (JSONB), linkedEntityIds, mentionedUserIds

### ✅ Полнотекстовый поиск (FTS)
- tsvector колонки в `entities` и `comments`
- Триггеры автообновления
- Русский язык
- API: `GET /api/search?q=текст`

### ✅ Кэшированные поля
- `commentCount`, `lastActivityAt`, `firstResponseAt`, `resolvedAt`
- Триггеры автоматического обновления

### ✅ Materialized Views
- `mv_workspace_stats`, `mv_assignee_stats`, `mv_daily_activity`
- Обновление через `AnalyticsService.refreshMaterializedViews()`

### ⏸️ Отложено: Партиционирование audit_logs
- Требует тестирования на копии prod данных
- Реализовать когда накопится >100k записей

---

## Миграции

| # | Timestamp | Название | Статус |
|---|-----------|----------|--------|
| 1 | 1738600000000 | InitialSchema | ✅ |
| 2 | 1770126681086 | AddAnalyticsIndexes | ✅ |
| 3 | 1770126700000 | AddFullTextSearch | ✅ |
| 4 | 1770126800000 | AddCachedFields | ✅ |
| 5 | 1770126900000 | AddMaterializedViews | ✅ |
| 6 | 1770200000000 | AddBpmnTables | ✅ |
| 7 | 1770270192000 | CreateOnboardingTables | ✅ |
| 8 | 1770300000000 | AddSections | ✅ |
| 9 | 1770400000000 | AddBpmnExtendedTables | ✅ |
| 10 | 1770500000000 | AddSlaAndDmnTables | ✅ |
| 11 | 1770600000000 | FixSlaAndDmnTables | ✅ |
| 12 | 1770700000000 | AddAiTables | ✅ |
