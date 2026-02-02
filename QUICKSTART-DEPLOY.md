# ⚡ Быстрый старт деплоя на Preprod

Эта инструкция поможет быстро настроить CI/CD и задеплоить приложение на preprod сервер.

## ✅ Что уже сделано

- ✅ Сервер настроен и готов (`51.250.117.178`)
- ✅ Docker установлен
- ✅ Директория `/opt/stankoff-portal` создана
- ✅ Конфигурационные файлы скопированы
- ✅ JWT секреты сгенерированы

## 📝 Что нужно сделать

### 1. Настроить переменные окружения на сервере (5 минут)

```bash
# SSH на сервер
ssh -l youredik 51.250.117.178

# Открыть .env для редактирования
nano /opt/stankoff-portal/.env
```

Замените следующие значения:

```bash
# Обязательно:
DATABASE_PASSWORD=ваш_надёжный_пароль_postgre
KEYCLOAK_ADMIN_PASSWORD=ваш_надёжный_пароль_админа

# Опционально (если будете использовать):
KEYCLOAK_CLIENT_SECRET=секрет_из_keycloak_консоли
S3_ACCESS_KEY=ваш_yandex_s3_access_key
S3_SECRET_KEY=ваш_yandex_s3_secret_key
```

Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

### 2. Создать GitHub Personal Access Token (2 минуты)

1. Перейдите: https://github.com/settings/tokens
2. Нажмите **Generate new token (classic)**
3. Настройте:
   - **Note**: `GHCR Token for Stankoff Portal`
   - **Expiration**: `No expiration`
   - **Scopes**: ✅ `write:packages`, ✅ `read:packages`
4. Нажмите **Generate token**
5. **Скопируйте токен** (показывается один раз!)

### 3. Добавить секреты в GitHub (3 минуты)

Перейдите в репозиторий → **Settings → Secrets and variables → Actions**

Создайте 4 секрета (кнопка **New repository secret**):

| Имя | Значение |
|-----|----------|
| `PREPROD_HOST` | `51.250.117.178` |
| `PREPROD_USER` | `youredik` |
| `PREPROD_SSH_KEY` | Вставьте содержимое `~/.ssh/id_rsa` |
| `GHCR_TOKEN` | Токен из шага 2 |

**Важно для `PREPROD_SSH_KEY`**:
```bash
# Скопировать приватный ключ
cat ~/.ssh/id_rsa | pbcopy   # macOS
cat ~/.ssh/id_rsa | xclip     # Linux
```
Вставьте весь ключ, включая строки `-----BEGIN...` и `-----END...`

### 4. Настроить DNS (1 минута)

Добавьте A-запись для домена:

```
preprod.stankoff.ru → 51.250.117.178
```

Проверьте:
```bash
nslookup preprod.stankoff.ru
```

### 5. Создать ветку develop и запустить деплой (1 минута)

```bash
# Локально в вашем репозитории
git checkout -b develop
git push -u origin develop
```

GitHub Actions автоматически:
1. Запустит тесты
2. Соберёт Docker образы
3. Опубликует в GitHub Container Registry
4. Задеплоит на preprod сервер

Следите за прогрессом: **GitHub → Actions**

### 6. Настроить SSL сертификат (5 минут)

После первого деплоя:

```bash
# SSH на сервер
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal

# Создать и запустить скрипт SSL
cat > init-ssl.sh << 'EOF'
#!/bin/bash
docker compose -f docker-compose.preprod.yml stop nginx
docker compose -f docker-compose.preprod.yml run --rm certbot certonly \
  --standalone \
  --email admin@stankoff.ru \
  --agree-tos \
  --no-eff-email \
  -d preprod.stankoff.ru
docker compose -f docker-compose.preprod.yml up -d nginx
echo "✅ SSL сертификат получен"
EOF

chmod +x init-ssl.sh
./init-ssl.sh
```

## ✅ Готово!

Теперь ваше приложение доступно на:
- **Frontend**: https://preprod.stankoff.ru (✅ SSL настроен)
- **Backend API**: https://preprod.stankoff.ru/api/health (✅ SSL настроен)
- **Keycloak**: Внешний сервис (не в docker-compose)

**SSL сертификат:**
- ✅ Let's Encrypt автоматически обновляется каждые 12 часов
- ✅ HTTP автоматически редиректит на HTTPS
- ✅ HTTP/2 включен

## 🔄 Workflow разработки

```bash
# 1. Создать feature ветку
git checkout develop
git pull
git checkout -b feature/my-feature

# 2. Разработка
# ... внести изменения ...
git add .
git commit -m "feat: добавлена новая функция"

# 3. Push и создание PR
git push origin feature/my-feature
# Создайте PR: feature/my-feature → develop в GitHub

# 4. После merge в develop → автоматический деплой на preprod
```

## 🛠️ Полезные команды

```bash
# Проверить статус на сервере
ssh -l youredik 51.250.117.178 "cd /opt/stankoff-portal && docker compose -f docker-compose.preprod.yml ps"

# Посмотреть логи
ssh -l youredik 51.250.117.178 "cd /opt/stankoff-portal && docker compose -f docker-compose.preprod.yml logs -f backend"

# Перезапустить сервисы
ssh -l youredik 51.250.117.178 "cd /opt/stankoff-portal && docker compose -f docker-compose.preprod.yml restart"

# Health check
curl https://preprod.stankoff.ru/api/health
```

## 📚 Дополнительная документация

- Полная инструкция: [docs/DEPLOY.md](docs/DEPLOY.md)
- Troubleshooting: [docs/DEPLOY.md#troubleshooting](docs/DEPLOY.md#troubleshooting)
- Архитектура: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## ❓ Проблемы?

### Deploy провалился

1. Проверьте GitHub Actions логи
2. Убедитесь, что все секреты добавлены
3. Проверьте SSH доступ: `ssh -l youredik 51.250.117.178`

### Контейнеры не запускаются

```bash
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal
docker compose -f docker-compose.preprod.yml logs backend
docker compose -f docker-compose.preprod.yml logs frontend
```

### SSL сертификат не работает

Проверьте, что DNS настроен правильно и указывает на сервер:
```bash
nslookup preprod.stankoff.ru
```

### Backend не создает схему БД

Если видите ошибку `relation "users" does not exist`:

```bash
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal

# Остановить контейнеры
docker compose -f docker-compose.preprod.yml down

# Удалить старый PostgreSQL volume
docker volume rm stankoff-portal_postgres-data

# Запустить заново (TypeORM создаст схему с TYPEORM_SYNC=true)
docker compose -f docker-compose.preprod.yml up -d

# Проверить логи
docker compose -f docker-compose.preprod.yml logs -f backend
```

---

**Готово!** Теперь у вас полностью настроенный CI/CD pipeline 🚀
