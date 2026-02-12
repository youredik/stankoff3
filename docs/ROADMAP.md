# Дорожная карта развития

**Обновлено:** 2026-02-12

## Текущее состояние

Реализовано и работает на preprod:
- Workspaces с кастомными полями (13 типов), канбан, таблица
- BPMN процессы (Zeebe), user tasks, triggers, incidents, process mining, heat maps
- SLA, DMN (Decision Tables)
- AI: классификация, RAG поиск, ассистент, streaming, уведомления, feedback, knowledge graph
- Chat (корпоративный мессенджер с reactions, pins, typing)
- RBAC (permission-based, 8 системных ролей)
- Knowledge Base (FAQ + документы)
- Legacy CRM интеграция (356K+ заявок мигрировано, синхронизация каждые 5 мин)
- Invitations (приглашение по email)
- Автоматические бэкапы PostgreSQL → S3

---

## Ближайшие задачи

### Инфраструктура (высокий приоритет)

- [ ] Sentry для ошибок (backend + frontend)
- [ ] Health monitoring + Telegram алерты
- [ ] Persistent structured logging
- [ ] Resource limits для Docker сервисов
- [ ] Rate limiting (ThrottlerModule)
- [ ] Операционный runbook (docs/OPERATIONS.md)

### Стабилизация

- [ ] E2E тесты с Keycloak (или mock auth)
- [ ] Нагрузочное тестирование
- [ ] Профилирование медленных запросов

---

## Фаза 3: Новые модули

### Reports (PDF/Excel)
- Отчёты по заявкам, исполнителям, SLA, AI использованию
- PDF (pdfkit), Excel (exceljs)

### Notifications (Push/Email/Telegram)
- Web Push, Telegram бот
- Настройка по каналам и событиям

### Индексация документов оборудования
- PDF/Word парсинг из legacy
- OCR для сканов (Tesseract)
- Связывание с товарами

---

## Фаза 4: Масштабирование и Production

### Инфраструктура
- [ ] Отдельный production сервер (или Managed Kubernetes)
- [ ] Репликация PostgreSQL (primary + read replica)
- [ ] Redis (сессии, кэширование, rate limiting, очереди Bull)
- [ ] CDN для статики

### Мониторинг
- [ ] ELK Stack или Grafana Loki
- [ ] APM (Sentry + Grafana)
- [ ] Алерты (downtime, SLA, AI ошибки, нагрузка)

### Безопасность
- [ ] Аудит OWASP
- [ ] Ротация секретов
- [ ] 2FA для администраторов

---

## Фаза 5: Расширение

### Другие отделы
- **Продажи:** воронка + AI скоринг лидов
- **Логистика:** отслеживание доставок
- **Установка/Наладка:** календарь выездов, чек-листы
- **Бухгалтерия:** интеграция с 1С

### Клиентский портал (v3.0)
- Личный кабинет клиента
- Telegram/WhatsApp бот
- Email-to-ticket
- Оценка качества

---

## KPI

| Метрика | Цель |
|---------|------|
| Время ответа на заявку | < 2 часов |
| Время решения | < 24 часов |
| AI автоклассификация accuracy | > 85% |
| AI ответы принятые | > 60% |
| Uptime | 99.9% |
