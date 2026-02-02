# 🚀 Инструкция по деплою Stankoff Portal

## Обзор CI/CD Pipeline

Наш CI/CD pipeline автоматизирует весь процесс доставки кода от коммита до продакшена:

```
Push в ветку
    ↓
GitHub Actions запускает pipeline
    ↓
1. Lint & Type Check (параллельно)
2. Backend Tests
3. Frontend Tests
    ↓
4. Build Docker Images
    ↓ (для develop)     ↓ (для main)
Deploy to Preprod      Deploy to Production
```

### Ветки и окружения

| Ветка | Окружение | Домен | Автоматический деплой |
|-------|-----------|-------|----------------------|
| `develop` | Preprod | preprod.stankoff.ru | ✅ Да |
| `main` | Production | bpms.stankoff.ru | ✅ Да |

## 📋 Подготовка к первому деплою

### 1. Настройка сервера

#### 1.1. Запустите скрипт автоматической настройки

```bash
./scripts/setup-preprod-server.sh
```

Скрипт автоматически:
- Проверит SSH доступ
- Установит Docker (если не установлен)
- Создаст директорию `/opt/stankoff-portal`
- Скопирует конфигурационные файлы
- Сгенерирует JWT секреты

#### 1.2. Настройте переменные окружения на сервере

SSH на сервер:
```bash
ssh -l youredik 51.250.117.178
```

Отредактируйте `/opt/stankoff-portal/.env`:
```bash
nano /opt/stankoff-portal/.env
```

Обязательно замените:
```bash
# PostgreSQL пароль
DATABASE_PASSWORD=ВАША_НАДЁЖНЫЙ_ПАРОЛЬ

# Keycloak админ пароль
KEYCLOAK_ADMIN_PASSWORD=ВАША_НАДЁЖНЫЙ_ПАРОЛЬ_АДМИНА

# Keycloak client secret (скопируйте из Keycloak Admin Console)
KEYCLOAK_CLIENT_SECRET=ваш-секрет-из-keycloak

# Yandex Object Storage (если используете S3)
S3_ACCESS_KEY=ваш-access-key
S3_SECRET_KEY=ваш-secret-key

# SMTP (если используете email)
SMTP_HOST=smtp.yandex.ru
SMTP_USER=noreply@stankoff.ru
SMTP_PASS=ваш-smtp-пароль
```

### 2. Настройка DNS

Добавьте A-запись для preprod домена:

```
preprod.stankoff.ru → 51.250.117.178
```

Проверьте DNS:
```bash
nslookup preprod.stankoff.ru
```

### 3. Настройка GitHub Secrets

#### 3.1. Создание Personal Access Token (PAT)

1. Перейдите: [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Нажмите **Generate new token (classic)**
3. Настройте:
   - **Note**: `GHCR Token for Stankoff Portal`
   - **Expiration**: `No expiration` (или срок действия)
   - **Scopes**:
     - ✅ `write:packages` — публикация Docker образов
     - ✅ `read:packages` — скачивание Docker образов
     - ✅ `delete:packages` — удаление старых образов
4. Нажмите **Generate token**
5. **Скопируйте токен** (показывается один раз!)

#### 3.2. Добавление секретов в GitHub

1. Перейдите в **Settings → Secrets and variables → Actions**
2. Нажмите **New repository secret** для каждого секрета:

| Имя секрета | Описание | Как получить |
|-------------|----------|--------------|
| `PREPROD_HOST` | IP адрес сервера | `51.250.117.178` |
| `PREPROD_USER` | SSH пользователь | `youredik` |
| `PREPROD_SSH_KEY` | Приватный SSH ключ | `cat ~/.ssh/id_rsa` |
| `GHCR_TOKEN` | Personal Access Token | Из шага 3.1 |
| `PROD_HOST` | IP продакшн сервера | Пока не нужен |
| `PROD_USER` | SSH пользователь продакшн | Пока не нужен |
| `PROD_SSH_KEY` | SSH ключ продакшн | Пока не нужен |

**Важно для `PREPROD_SSH_KEY`**:
- Скопируйте **весь** приватный ключ, включая строки `-----BEGIN ... KEY-----` и `-----END ... KEY-----`
- Убедитесь, что на сервере есть соответствующий публичный ключ в `~/.ssh/authorized_keys`

#### 3.3. Настройка Environments (опционально, для защиты)

1. Перейдите в **Settings → Environments**
2. Создайте environment `preprod`:
   - **Deployment branches**: `develop` (только ветка develop может деплоить)
   - **Required reviewers**: Добавьте себя (деплой требует подтверждения)

3. Создайте environment `production`:
   - **Deployment branches**: `main` (только main может деплоить)
   - **Required reviewers**: Обязательно добавьте reviewers для продакшена!

### 4. Создание ветки develop

```bash
# Создание ветки develop
git checkout -b develop

# Пуш в удалённый репозиторий
git push -u origin develop
```

## 🔄 Процесс разработки и деплоя

### Workflow разработки

```bash
# 1. Разработка в feature ветках
git checkout -b feature/my-feature
# ... делаем изменения ...
git commit -m "feat: добавлена новая функция"
git push origin feature/my-feature

# 2. Pull Request в develop
# Создайте PR: feature/my-feature → develop
# После ревью и merge, GitHub Actions автоматически задеплоит на preprod

# 3. Тестирование на preprod
# Проверьте на https://preprod.stankoff.ru

# 4. Если всё работает, создайте PR: develop → main
# После merge в main, автоматически задеплоится на production
```

### Триггеры CI/CD

| Событие | Что запускается |
|---------|-----------------|
| Push в любую ветку | Lint, Type Check, Tests |
| Push в `develop` | Lint, Tests, Build, **Deploy to Preprod** |
| Push в `main` | Lint, Tests, Build, **Deploy to Production** |
| Pull Request | Lint, Type Check, Tests (без деплоя) |

## 🔍 Мониторинг деплоя

### Просмотр логов GitHub Actions

1. Перейдите в **Actions** в репозитории
2. Выберите последний запуск workflow
3. Посмотрите логи каждого job'а

### Проверка статуса деплоя

```bash
# SSH на сервер
ssh -l youredik 51.250.117.178

# Проверка статуса контейнеров
cd /opt/stankoff-portal
docker compose -f docker-compose.preprod.yml ps

# Логи сервисов
docker compose -f docker-compose.preprod.yml logs -f backend
docker compose -f docker-compose.preprod.yml logs -f frontend
docker compose -f docker-compose.preprod.yml logs -f nginx

# Health check
curl http://localhost:3001/api/health
```

### Проверка работоспособности

1. **Backend API**: https://preprod.stankoff.ru/api/health (✅ SSL настроен)
2. **Frontend**: https://preprod.stankoff.ru (✅ SSL настроен)
3. **Keycloak**: Внешний сервис (не в docker-compose)

**Статус preprod окружения:**
- ✅ SSL сертификат Let's Encrypt активен (автообновление каждые 12 часов)
- ✅ HTTP → HTTPS редирект настроен
- ✅ HTTP/2 включен
- ✅ TypeORM автоматически создает схему БД (TYPEORM_SYNC=true)

## 🛠️ Ручной деплой

### Если GitHub Actions недоступен

```bash
# SSH на сервер
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal

# Логин в GitHub Container Registry
echo "YOUR_GHCR_TOKEN" | docker login ghcr.io -u youredik --password-stdin

# Остановка сервисов
docker compose -f docker-compose.preprod.yml down

# Скачивание последних образов
docker compose -f docker-compose.preprod.yml pull

# Запуск сервисов
docker compose -f docker-compose.preprod.yml up -d

# Проверка
docker compose -f docker-compose.preprod.yml ps
curl http://localhost:3001/api/health
```

## 🔐 SSL сертификаты (Let's Encrypt)

**Статус preprod:** ✅ SSL сертификат настроен и работает

- Домен: preprod.stankoff.ru
- Выдан: Let's Encrypt (E8)
- Автообновление: Каждые 12 часов через Certbot
- HTTP/2: Включен
- HTTPS редирект: Включен

### Первичная генерация (уже выполнено для preprod)

Если нужно настроить SSL для нового окружения:

```bash
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal

# Создание скрипта генерации SSL
cat > init-ssl.sh << 'EOF'
#!/bin/bash
DOMAIN="preprod.stankoff.ru"
EMAIL="admin@stankoff.ru"

# Остановка nginx
docker compose -f docker-compose.preprod.yml stop nginx

# Генерация сертификата
docker compose -f docker-compose.preprod.yml run --rm certbot certonly \
  --standalone \
  --preferred-challenges http \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $DOMAIN

# Запуск nginx
docker compose -f docker-compose.preprod.yml up -d nginx

echo "✅ SSL сертификат получен для $DOMAIN"
EOF

chmod +x init-ssl.sh
./init-ssl.sh
```

### Автоматическое обновление

Certbot автоматически проверяет и обновляет сертификаты **каждые 12 часов**.

Проверить статус:
```bash
docker compose -f docker-compose.preprod.yml logs certbot
```

Ручное обновление:
```bash
docker compose -f docker-compose.preprod.yml run --rm certbot renew
docker compose -f docker-compose.preprod.yml exec nginx nginx -s reload
```

## 🐛 Troubleshooting

### Deploy провалился с ошибкой SSH

**Проблема**: `Permission denied (publickey)`

**Решение**:
1. Проверьте, что публичный ключ добавлен на сервер:
   ```bash
   ssh -l youredik 51.250.117.178
   cat ~/.ssh/authorized_keys
   ```
2. Проверьте формат приватного ключа в `PREPROD_SSH_KEY` (должен включать `-----BEGIN...` и `-----END...`)

### Docker образы не скачиваются

**Проблема**: `Error response from daemon: unauthorized`

**Решение**:
1. Проверьте `GHCR_TOKEN` в GitHub Secrets
2. Убедитесь, что токен имеет права `read:packages` и `write:packages`
3. Проверьте, что образы публичные или токен имеет доступ к приватным

### Контейнер не запускается

**Проблема**: `container exited with code 1`

**Решение**:
```bash
# Посмотрите логи
docker compose -f docker-compose.preprod.yml logs backend
docker compose -f docker-compose.preprod.yml logs frontend

# Проверьте переменные окружения
docker compose -f docker-compose.preprod.yml exec backend env
```

### Health check провален

**Проблема**: `curl: (7) Failed to connect`

**Решение**:
```bash
# Проверьте, что контейнеры запущены
docker compose -f docker-compose.preprod.yml ps

# Проверьте, что PostgreSQL доступна
docker compose -f docker-compose.preprod.yml exec postgres pg_isready

# Проверьте логи backend
docker compose -f docker-compose.preprod.yml logs backend
```

### TypeORM не создает схему БД

**Проблема**: `relation "users" does not exist` в логах backend

**Причина**: PostgreSQL volume содержит старую БД без схемы, или TYPEORM_SYNC не включен

**Решение**:
```bash
# 1. Проверьте, что TYPEORM_SYNC=true в .env
grep TYPEORM_SYNC /opt/stankoff-portal/.env

# 2. Проверьте, что переменная передается в контейнер
docker compose -f docker-compose.preprod.yml config | grep TYPEORM_SYNC

# 3. Если переменная есть, но схема не создается - удалите volume
docker compose -f docker-compose.preprod.yml down
docker volume rm stankoff-portal_postgres-data
docker compose -f docker-compose.preprod.yml up -d

# 4. Проверьте, что схема создалась
docker compose -f docker-compose.preprod.yml exec postgres psql -U postgres -d stankoff_preprod -c '\dt'
```

## 📊 Best Practices

### 1. Всегда тестируйте на preprod

- Никогда не деплойте напрямую в main
- Создавайте PR: `feature → develop → main`
- Тестируйте функционал на preprod.stankoff.ru

### 2. Используйте conventional commits

```bash
feat: добавлена новая функция
fix: исправлен баг с авторизацией
docs: обновлена документация
refactor: рефакторинг модуля entities
test: добавлены E2E тесты
chore: обновлены зависимости
```

### 3. Настройте branch protection

GitHub → Settings → Branches → Add rule для `main`:
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
  - Выберите: `Lint & Type Check`, `Backend Tests`, `Frontend Tests`
- ✅ Require branches to be up to date before merging
- ✅ Include administrators

### 4. Мониторинг и логи

Настройте уведомления в GitHub Actions:
- Settings → Notifications → Actions
- ✅ Notify me when a workflow run fails

## 🎯 Roadmap Production

После успешного тестирования на preprod:

1. [ ] Получить отдельный сервер для production
2. [ ] Настроить DNS для `bpms.stankoff.ru`
3. [ ] Добавить `PROD_*` секреты в GitHub
4. [ ] Настроить backup на production (автоматический бэкап БД)
5. [ ] Настроить мониторинг (Prometheus + Grafana)
6. [ ] Настроить алерты (Slack/Telegram уведомления)
7. [ ] Создать runbook для инцидентов

---

Если возникли вопросы — создайте issue в репозитории или обратитесь к разработчику.
