# CI/CD и деплой

## Обзор

```
Push в ветку
    ↓
1. Lint & Type Check (параллельно)
2. Backend Tests (Jest)
3. Frontend Tests
    ↓
4. Build Docker Images (AMD64) → Push to GHCR
    ↓
5. Deploy to Server (SSH + Docker Swarm)
```

## Ветки и окружения

| Ветка | Окружение | Домен | Docker Tag |
|-------|-----------|-------|------------|
| `develop` | Preprod | preprod.stankoff.ru | `preprod` |
| `main` | Production | bpms.stankoff.ru | `latest` |

Docker образы: `ghcr.io/youredik/stankoff3/{frontend,backend,backup}:{tag}`

## GitHub Secrets

| Secret | Описание |
|--------|----------|
| `PREPROD_HOST` | IP сервера (51.250.117.178) |
| `PREPROD_USER` | SSH пользователь (youredik) |
| `PREPROD_SSH_KEY` | Приватный SSH ключ (весь, включая BEGIN/END) |
| `GHCR_TOKEN` | Personal Access Token (`write:packages`, `read:packages`) |

Создание GHCR_TOKEN: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).

## Workflow разработки

```bash
# 1. Feature ветка
git checkout -b feature/my-feature
git commit -m "feat: описание"
git push origin feature/my-feature

# 2. PR в develop → автодеплой на preprod
# 3. Тест на https://preprod.stankoff.ru
# 4. PR develop → main → production (когда включим)
```

## Docker Swarm (Zero-Downtime)

Preprod использует Docker Swarm:

```yaml
deploy:
  update_config:
    order: start-first       # Сначала новый контейнер
    failure_action: rollback  # При ошибке — откат
  restart_policy:
    condition: any
```

**Процесс:** новый контейнер → healthcheck → переключение трафика → удаление старого.

## Подготовка сервера

### 1. Установка Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo apt-get install docker-compose-plugin
```

### 2. Директория и конфиги

```bash
sudo mkdir -p /opt/stankoff-portal
sudo chown $USER:$USER /opt/stankoff-portal
```

CI/CD автоматически синхронизирует `docker-compose.preprod.yml` и `nginx.preprod.conf` на сервер.

### 3. Файл .env на сервере

`/opt/stankoff-portal/.env` — **реальные секреты, не шаблон!** Не перезаписывать при деплое.

```bash
chmod 600 /opt/stankoff-portal/.env
```

### 4. SSL (Let's Encrypt)

```bash
# Первичное получение
docker compose -f docker-compose.preprod.yml run --rm certbot certonly \
  --standalone -d preprod.stankoff.ru --email admin@stankoff.ru --agree-tos

# Автообновление — каждые 12 часов через Certbot в docker-compose
```

## Автоматические бэкапы PostgreSQL

- Сервис `backup` в docker-compose (`ghcr.io/youredik/stankoff3/backup:preprod`)
- Cron: 2 раза в сутки (03:00 и 15:00 MSK) → `pg_dump` → gzip → S3 (Yandex Object Storage)
- Retention: 7 дней (локально и S3)
- Telegram нотификации при ошибке/успехе
- Ручной запуск: `docker exec <container> /scripts/backup.sh list-s3`

## Ручной деплой

```bash
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal

echo "TOKEN" | docker login ghcr.io -u youredik --password-stdin
docker compose -f docker-compose.preprod.yml pull
docker compose -f docker-compose.preprod.yml up -d --remove-orphans
docker image prune -f
curl http://localhost:3001/api/health
```

## Мониторинг

```bash
# Статус сервисов
docker stack services stankoff-preprod

# Логи
docker service logs stankoff-preprod_backend -f
docker service logs stankoff-preprod_frontend -f

# Health checks
curl https://preprod.stankoff.ru/api/health
curl https://preprod.stankoff.ru/api/bpmn/health
```

## Troubleshooting

### SSH: Permission denied
Проверьте `PREPROD_SSH_KEY` в GitHub Secrets — должен включать `-----BEGIN...` и `-----END...`.

### Docker: unauthorized
Проверьте `GHCR_TOKEN` — нужны права `read:packages`, `write:packages`.

### Контейнер не стартует
```bash
docker service logs stankoff-preprod_backend
docker compose -f docker-compose.preprod.yml exec postgres pg_isready
```

### Известные проблемы Docker Swarm
- **IPv6/IPv4:** `localhost` → IPv6, но nginx слушает IPv4. Используй `127.0.0.1` в healthcheck.
- **nginx proxy_pass:** С переменной не добавляет URI автоматически. Используй `proxy_pass http://$var;` без пути.
- **Тома:** Swarm добавляет префикс стека. Для существующих — `external: true`.
- **Пароль PostgreSQL:** Зафиксирован в томе. Менять через `ALTER USER`, не через env.

## Конвенции коммитов

```
feat: добавлена новая функция
fix: исправлен баг
docs: обновлена документация
refactor: рефакторинг
test: добавлены тесты
chore: обновлены зависимости
```
