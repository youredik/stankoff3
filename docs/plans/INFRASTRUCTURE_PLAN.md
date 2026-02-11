# Инфраструктура препрода: стратегический план

> **Статус:** Планирование
> **Дата:** 2026-02-11
> **Приоритет:** Высокий — надёжность и наблюдаемость системы

## Контекст

Препрод работает на Docker Swarm (4 CPU, 8 GB RAM, 150 GB), но критически не хватает:
- **Бекапов** — скрипты готовы, но контейнер не запущен
- **Мониторинга** — только health endpoints, нет Sentry, нет alerting
- **Логирования** — Winston в файлы, но volume теряется при redeploy
- **Защиты** — нет resource limits для frontend/backend, нет rate limiting в NestJS
- **Документации** — нет runbook для операций

---

## Блок 1: Автоматические бекапы PostgreSQL ✅ Реализован
**Приоритет: КРИТИЧЕСКИЙ** | Скрипты готовы, нужна интеграция

- Добавить Telegram нотификации в backup.sh
- Добавить backup сервис в docker-compose.preprod.yml
- Build backup image в CI/CD
- Обновить .env.preprod

---

## Блок 2: Sentry для отслеживания ошибок
**Приоритет: ВЫСОКИЙ** | Free tier: 5K events/month

### Backend (NestJS)
- Установить `@sentry/nestjs`
- `instrument.ts` — инициализация (импорт в начале `main.ts`)
- `SentryGlobalFilter` — отправка 5xx в Sentry
- `process.on('unhandledRejection'/'uncaughtException')`
- `tracesSampleRate: 0.1` (10% транзакций, экономим free tier)

### Frontend (Next.js)
- Установить `@sentry/nextjs`
- `sentry.client.config.ts`, `sentry.server.config.ts`
- `global-error.tsx` — error boundary
- `withSentryConfig()` в `next.config.ts`

### Env
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`

---

## Блок 3: Health monitoring + Telegram алерты
**Приоритет: ВЫСОКИЙ** | Зависит от Блока 1

### Скрипт `scripts/monitor.sh` (каждые 5 мин через cron в backup-контейнере)
- Health endpoints: `/api/health`, `/api/bpmn/health`
- Backup freshness: файл за последние 90 мин
- SSL expiry: предупреждение за 14 дней
- Disk usage: >85%
- Дедупликация алертов

### Backend: `TelegramAlertService`
- `apps/backend/src/modules/notification/telegram-alert.service.ts`
- `@Global()` модуль, graceful degradation
- Интеграция: SLA breach, process incident, ошибка legacy sync

---

## Блок 4: Persistent & structured logging
**Приоритет: СРЕДНИЙ**

- `backend-logs` volume → external (сохраняется при redeploy)
- Request logging middleware (метод, URL, status, duration, исключая /health)
- console.log → Logger в events.gateway.ts (6 штук) и main.ts
- Docker logging driver: json-file, max-size 10m, max-file 3

---

## Блок 5: Resource limits и защита
**Приоритет: СРЕДНИЙ**

### Resource limits (бюджет 8 GB)
| Сервис | Limit | Reservation |
|--------|-------|-------------|
| postgres | 1536M | 512M |
| camunda | 1G | 512M (есть) |
| ollama | 1G | 512M (есть) |
| backend | 1G | 256M |
| frontend | 512M | 128M |
| nginx | 128M | 64M |
| backup | 256M | 64M |
| certbot | 64M | 32M |
| **Итого** | **~5.5G** | **~2.1G** |

### ThrottlerModule в NestJS
- `@nestjs/throttler`: 100 req/min на IP
- `@SkipThrottle()` на EventsGateway и HealthController

---

## Блок 6: Операционный runbook
**Приоритет: СРЕДНИЙ**

- `docs/OPERATIONS.md` — процедуры:
  - Проверка состояния, просмотр логов
  - Восстановление БД из бекапа (S3)
  - Перезапуск сервиса, rollback деплоя
  - Инцидент Zeebe (очистка volume)
  - SSL обновление

---

## Порядок реализации

| # | Блок | Время | Зависимости |
|---|------|-------|-------------|
| 1 | Бекапы PostgreSQL | 3-4ч | Нет |
| 2 | Persistent logging | 3-4ч | Нет |
| 3 | Resource limits | 3-4ч | Нет |
| 4 | Sentry | 5-6ч | Нет |
| 5 | Monitoring + Telegram | 6-8ч | Блок 1 |
| 6 | Runbook | 2-3ч | Блоки 1-5 |

**Итого: ~22-29 часов**
