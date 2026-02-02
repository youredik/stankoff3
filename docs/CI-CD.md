# CI/CD Pipeline

## Обзор

Проект использует GitHub Actions для автоматического тестирования, сборки и деплоя.

### Ветки

| Ветка | Окружение | URL | Docker Tag |
|-------|-----------|-----|------------|
| `main` | Production | stankoff.ru | `latest` |
| `develop` | Preprod | preprod.stankoff.ru | `preprod` |

### Pipeline

```
Push → Lint → Tests → Build Docker → Deploy
```

1. **Lint & Type Check** - ESLint + TypeScript build
2. **Backend Tests** - Jest unit tests
3. **Frontend Tests** - Jest unit tests
4. **Build Docker Images** - Push to GitHub Container Registry (GHCR)
5. **Deploy** - SSH deploy на целевой сервер

## GitHub Secrets

### Обязательные секреты для Preprod

Настройте в **Settings → Secrets and variables → Actions**:

| Secret | Описание | Пример |
|--------|----------|--------|
| `PREPROD_HOST` | IP адрес preprod сервера | `51.250.xxx.xxx` |
| `PREPROD_USER` | SSH пользователь | `ubuntu` или `root` |
| `PREPROD_SSH_KEY` | Приватный SSH ключ | содержимое `~/.ssh/id_rsa` |
| `GHCR_TOKEN` | GitHub Personal Access Token с правами `read:packages` | `ghp_xxx...` |

### Обязательные секреты для Production

| Secret | Описание | Пример |
|--------|----------|--------|
| `PROD_HOST` | IP адрес production сервера | `51.250.xxx.xxx` |
| `PROD_USER` | SSH пользователь | `ubuntu` |
| `PROD_SSH_KEY` | Приватный SSH ключ | содержимое `~/.ssh/id_rsa` |
| `GHCR_TOKEN` | GitHub Personal Access Token | `ghp_xxx...` |

### Создание GHCR_TOKEN

1. Перейдите в **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Нажмите **Generate new token (classic)**
3. Выберите scopes:
   - `read:packages` - для pull docker images
   - `write:packages` - если нужно push (для CI уже используется GITHUB_TOKEN)
4. Скопируйте токен и добавьте в Secrets

## GitHub Environments

Создайте environments в **Settings → Environments**:

### preprod
- Environment name: `preprod`
- (опционально) Protection rules: нет
- Environment secrets: можно добавить специфичные для preprod переменные

### production
- Environment name: `production`
- (опционально) Protection rules:
  - Required reviewers: добавьте ответственных
  - Wait timer: 0-30 минут

## Подготовка сервера

### 1. Установка Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose plugin
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

### 2. Создание директории проекта

```bash
sudo mkdir -p /opt/stankoff-portal
sudo chown $USER:$USER /opt/stankoff-portal
cd /opt/stankoff-portal
```

### 3. Копирование конфигов

Скопируйте на сервер:
- `docker-compose.preprod.yml` (для preprod)
- `docker-compose.prod.yml` (для production)
- Папку `nginx/`
- Папку `scripts/` (для postgres-init)

```bash
# С локальной машины
scp docker-compose.preprod.yml user@preprod-server:/opt/stankoff-portal/
scp -r nginx/ user@preprod-server:/opt/stankoff-portal/
scp -r scripts/ user@preprod-server:/opt/stankoff-portal/
```

### 4. Создание .env файла

```bash
cat > /opt/stankoff-portal/.env << 'EOF'
# Database
DATABASE_NAME=stankoff_preprod
DATABASE_USER=postgres
DATABASE_PASSWORD=your-secure-password

# JWT
JWT_SECRET=your-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars

# Keycloak
KEYCLOAK_ADMIN_PASSWORD=your-keycloak-admin-password
KEYCLOAK_CLIENT_SECRET=your-client-secret

# S3 (Yandex Object Storage)
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# URLs
NEXT_PUBLIC_API_URL=https://preprod.stankoff.ru/api
NEXT_PUBLIC_WS_URL=wss://preprod.stankoff.ru/ws
FRONTEND_URL=https://preprod.stankoff.ru
EOF

chmod 600 /opt/stankoff-portal/.env
```

### 5. Первый запуск

```bash
cd /opt/stankoff-portal

# Авторизация в GHCR
echo "YOUR_GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull и запуск
docker compose -f docker-compose.preprod.yml pull
docker compose -f docker-compose.preprod.yml up -d

# Проверка
docker compose -f docker-compose.preprod.yml ps
docker compose -f docker-compose.preprod.yml logs -f
```

### 6. SSL сертификат (Let's Encrypt)

```bash
# Первичное получение сертификата
docker compose -f docker-compose.preprod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d preprod.stankoff.ru \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# После получения - раскомментировать HTTPS блок в nginx.preprod.conf
# и перезапустить nginx
docker compose -f docker-compose.preprod.yml restart nginx
```

## Ручной деплой

Если нужно задеплоить вручную без CI:

```bash
ssh user@preprod-server

cd /opt/stankoff-portal

# Pull новых образов
docker compose -f docker-compose.preprod.yml pull

# Перезапуск с новыми образами
docker compose -f docker-compose.preprod.yml up -d --remove-orphans

# Очистка старых образов
docker image prune -f

# Проверка
curl http://localhost:3001/api/health
```

## Мониторинг

### Логи

```bash
# Все сервисы
docker compose -f docker-compose.preprod.yml logs -f

# Конкретный сервис
docker compose -f docker-compose.preprod.yml logs -f backend
docker compose -f docker-compose.preprod.yml logs -f frontend
docker compose -f docker-compose.preprod.yml logs -f nginx
```

### Статус

```bash
docker compose -f docker-compose.preprod.yml ps
```

### Health checks

```bash
# Backend
curl http://localhost:3001/api/health

# Frontend (через nginx)
curl http://localhost/
```

## Troubleshooting

### Образы не пуллятся

```bash
# Проверьте авторизацию в GHCR
docker login ghcr.io -u YOUR_USERNAME

# Проверьте что образы существуют
docker pull ghcr.io/youredik/stankoff3/backend:preprod
```

### Deploy не срабатывает

1. Проверьте что ветка `develop` (для preprod) или `main` (для prod)
2. Проверьте GitHub Actions logs
3. Проверьте что все Secrets настроены
4. Проверьте SSH доступ к серверу

### Сервисы не стартуют

```bash
# Посмотреть логи
docker compose -f docker-compose.preprod.yml logs backend

# Проверить зависимости (postgres должен быть healthy)
docker compose -f docker-compose.preprod.yml ps
```
