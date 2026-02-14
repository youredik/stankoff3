# Инфраструктура

**Обновлено:** 2026-02-12

## Текущее состояние (Preprod)

| Ресурс | Характеристики |
|--------|---------------|
| **Сервер** | Yandex Cloud VM, 4 CPU, 8 GB RAM, 150 GB диск, swap 4 GB |
| **IP** | 51.250.117.178 |
| **Оркестрация** | Docker Swarm (zero-downtime, start-first) |
| **PostgreSQL** | pgvector/pgvector:pg16 |
| **Zeebe** | camunda/zeebe:8.7.21 (512M reservation, 1G limit) |
| **SSL** | Let's Encrypt (Certbot, автообновление каждые 12 часов) |
| **Бэкапы** | 2 раза/сутки → S3, retention 7 дней, Telegram алерты |
| **CI/CD** | GitHub Actions → GHCR → Docker Swarm |

## Resource limits (бюджет 8 GB)

| Сервис | Limit | Reservation |
|--------|-------|-------------|
| postgres | 1536M | 512M |
| camunda (zeebe) | 1G | 512M |
| backend | 1G | 256M |
| frontend | 512M | 128M |
| nginx | 128M | 64M |
| backup | 256M | 64M |
| certbot | 64M | 32M |
| **Итого** | **~4.5G** | **~1.6G** |

## Реализовано

### Автоматические бэкапы PostgreSQL
- Сервис `backup` в docker-compose.preprod.yml
- Cron: 03:00 и 15:00 MSK → `pg_dump` → gzip → S3
- Retention: 7 дней
- Telegram нотификации
- Скрипт: `scripts/backup.sh`

### Zero-Downtime Deployment
- Docker Swarm: start-first, rollback при ошибке
- Healthcheck для всех сервисов
- CI/CD синхронизирует конфиги через scp

## План реализации

| # | Блок | Статус | Описание |
|---|------|--------|----------|
| 1 | Бэкапы PostgreSQL | **Готово** | pg_dump → S3, Telegram |
| 2 | Sentry | Планируется | `@sentry/nestjs` + `@sentry/nextjs`, free tier 5K events/month |
| 3 | Health monitoring + Telegram | Планируется | scripts/monitor.sh (cron 5 мин), проверка endpoints + backup freshness + SSL + disk |
| 4 | Persistent logging | Планируется | backend-logs volume, request logging middleware, Docker json-file driver |
| 5 | Resource limits | Планируется | ThrottlerModule (100 req/min на IP), Docker memory limits |
| 6 | Runbook | Планируется | docs/OPERATIONS.md — восстановление БД, rollback, инциденты Zeebe |

## Важные заметки

- **Пароль PostgreSQL** зафиксирован в томе данных. `POSTGRES_PASSWORD` env var игнорируется. Менять через `ALTER USER`.
- **`.env` на сервере** (`/opt/stankoff-portal/.env`) — реальные секреты, не перезаписывать!
- **AI** — только Yandex Cloud (YandexGPT + embeddings), OpenAI как fallback. 0 ГБ RAM на сервере.
- **Zeebe NullPointerException** — очистить volume: `docker volume rm stankoff-prepred_camunda-data`.
