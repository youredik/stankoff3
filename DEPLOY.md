# Деплой Stankoff Portal в Production

## Требования к серверу

- **OS:** Ubuntu 22.04+ / Debian 11+ / CentOS 8+
- **CPU:** 2+ ядра
- **RAM:** 4+ GB
- **Disk:** 20+ GB SSD
- **Docker:** 24.0+
- **Docker Compose:** 2.20+

## Быстрый старт

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/your-repo/stankoff-portal.git
cd stankoff-portal

# 2. Настройте окружение
cp .env.example .env
nano .env  # Отредактируйте переменные

# 3. Запустите деплой
./scripts/deploy.sh deploy
```

## Пошаговая инструкция

### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo apt install docker-compose-plugin -y

# Перезайдите в систему для применения группы docker
exit
```

### 2. Настройка DNS

Добавьте A-запись для вашего домена:

```
bpms.stankoff.ru  →  IP_вашего_сервера
```

### 3. Настройка переменных окружения

```bash
cp .env.example .env
```

**Обязательные переменные для production:**

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DATABASE_PASSWORD` | Пароль PostgreSQL | Сгенерируйте сложный |
| `JWT_SECRET` | Секрет JWT токенов | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Секрет refresh токенов | `openssl rand -hex 32` |
| `S3_BUCKET` | Имя S3 бакета | `stankoff-portal-files` |
| `S3_ACCESS_KEY` | Access key S3 | Из Yandex Cloud |
| `S3_SECRET_KEY` | Secret key S3 | Из Yandex Cloud |
| `DOMAIN` | Домен сайта | `bpms.stankoff.ru` |
| `CERTBOT_EMAIL` | Email для SSL | `admin@stankoff.ru` |

**Production настройки (раскомментируйте в .env):**

```bash
NODE_ENV=production
FRONTEND_URL=https://bpms.stankoff.ru
NEXT_PUBLIC_API_URL=https://bpms.stankoff.ru/api
NEXT_PUBLIC_WS_URL=wss://bpms.stankoff.ru
```

### 4. Настройка S3 (Yandex Object Storage)

1. Создайте сервисный аккаунт в Yandex Cloud
2. Создайте статический ключ доступа
3. Создайте бакет (приватный)
4. Заполните S3_* переменные в .env

### 5. Первый запуск

```bash
# Полный деплой
./scripts/deploy.sh deploy

# Проверка статуса
./scripts/deploy.sh status

# Проверка здоровья
./scripts/deploy.sh health
```

### 6. Настройка SSL (Let's Encrypt)

```bash
# Инициализация SSL сертификата
./scripts/deploy.sh init-ssl admin@stankoff.ru

# Тестовый режим (staging)
STAGING=1 ./scripts/init-ssl.sh admin@stankoff.ru
```

SSL сертификаты автоматически обновляются каждые 12 часов.

## Команды управления

```bash
# Основные команды
./scripts/deploy.sh deploy      # Полный деплой
./scripts/deploy.sh update      # Обновление (git pull + deploy)
./scripts/deploy.sh start       # Запуск сервисов
./scripts/deploy.sh stop        # Остановка
./scripts/deploy.sh restart     # Перезапуск
./scripts/deploy.sh status      # Статус сервисов
./scripts/deploy.sh health      # Проверка здоровья

# Логи
./scripts/deploy.sh logs        # Все логи
./scripts/deploy.sh logs backend  # Логи backend
./scripts/deploy.sh logs frontend # Логи frontend

# Бэкапы
./scripts/deploy.sh backup      # Создать бэкап в S3
./scripts/deploy.sh restore     # Восстановить из последнего

# Обслуживание
./scripts/deploy.sh cleanup     # Очистка Docker ресурсов
```

## Бэкапы базы данных

### Автоматические бэкапы

- Выполняются **каждый час** автоматически
- Сохраняются в S3 (`S3_BACKUP_PREFIX/`)
- Хранятся **7 дней** (настраивается через `BACKUP_RETENTION_DAYS`)

### Ручные бэкапы

```bash
# Создать бэкап и загрузить в S3
./scripts/backup.sh backup-s3

# Список бэкапов в S3
./scripts/backup.sh list-s3

# Восстановить из последнего бэкапа
./scripts/backup.sh restore-s3

# Восстановить из конкретного бэкапа
./scripts/backup.sh restore-s3 backups/postgres/stankoff_2025-01-15_12-00.sql.gz
```

## Мониторинг

### Health Endpoints

| URL | Описание |
|-----|----------|
| `/api/health` | Полный статус системы |
| `/api/health/live` | Liveness probe |
| `/api/health/ready` | Readiness probe |

### Логи

```bash
# Все логи
docker compose -f docker-compose.prod.yml logs -f

# Логи конкретного сервиса
docker logs stankoff-backend -f
docker logs stankoff-frontend -f
docker logs stankoff-nginx -f

# Логи бэкап-сервиса
docker logs stankoff-backup
```

### Файловые логи

Backend пишет логи в Docker volume `backend-logs`:

```bash
docker exec stankoff-backend cat /app/logs/error.log
docker exec stankoff-backend cat /app/logs/combined.log
```

## Обновление приложения

### Обычное обновление

```bash
./scripts/deploy.sh update
```

Это выполнит:
1. `git pull` (получение изменений)
2. Бэкап базы данных
3. Пересборку образов
4. Перезапуск сервисов

### Ручное обновление

```bash
git pull
./scripts/deploy.sh build
./scripts/deploy.sh restart
./scripts/deploy.sh health
```

## Решение проблем

### Backend не запускается

```bash
# Проверить логи
docker logs stankoff-backend

# Проверить подключение к БД
docker exec stankoff-backend npm run migration:show
```

### Проблемы с SSL

```bash
# Проверить сертификаты
docker exec stankoff-nginx ls -la /etc/letsencrypt/live/

# Принудительное обновление
docker compose -f docker-compose.prod.yml run --rm certbot renew --force-renewal
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Проблемы с бэкапами

```bash
# Проверить логи бэкап-сервиса
docker logs stankoff-backup

# Проверить подключение к S3
docker exec stankoff-backup aws s3 ls s3://$S3_BUCKET/
```

### Очистка диска

```bash
# Удалить неиспользуемые Docker ресурсы
./scripts/deploy.sh cleanup

# Удалить старые образы
docker image prune -a
```

## Безопасность

### Рекомендации

1. **Firewall:** Откройте только порты 80, 443, 22
2. **SSH:** Используйте ключи вместо паролей
3. **Secrets:** Никогда не коммитьте .env в git
4. **Updates:** Регулярно обновляйте систему и Docker

### Настройка firewall (UFW)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Масштабирование

При росте нагрузки рекомендуется:

1. **Вертикальное:** Увеличить CPU/RAM сервера
2. **Horizontal:** Развернуть несколько backend инстансов
3. **CDN:** Использовать CDN для статики
4. **Redis:** Добавить Redis для кэширования
5. **Read Replicas:** Добавить реплики PostgreSQL

## Поддержка

При возникновении проблем:

1. Проверьте логи: `./scripts/deploy.sh logs`
2. Проверьте здоровье: `./scripts/deploy.sh health`
3. Проверьте документацию: `docs/ARCHITECTURE.md`
4. Создайте issue: https://github.com/your-repo/stankoff-portal/issues
