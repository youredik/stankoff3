# 🎯 Следующие шаги для запуска CI/CD

## ✅ Что уже сделано

1. ✅ Сервер настроен автоматически (`51.250.117.178`)
2. ✅ CI/CD pipeline готов
3. ✅ Ветка develop создана
4. ✅ Production deployment временно отключен
5. ✅ Документация создана
6. ✅ SSL сертификат Let's Encrypt настроен и работает
7. ✅ Preprod окружение работает: https://preprod.stankoff.ru
8. ✅ TYPEORM_SYNC настроен для автоматического создания схемы БД
9. ✅ Keycloak удален из docker-compose (используется внешний)

## 📋 Что нужно сделать (15 минут)

### Шаг 1: Настроить переменные окружения на сервере (5 мин)

```bash
ssh -l youredik 51.250.117.178
nano /opt/stankoff-portal/.env
```

Замените:
```bash
DATABASE_PASSWORD=ваш_надёжный_пароль
KEYCLOAK_ADMIN_PASSWORD=ваш_надёжный_пароль
```

### Шаг 2: Создать GitHub Personal Access Token (2 мин)

1. Перейти: https://github.com/settings/tokens
2. Generate new token (classic)
3. Выбрать scopes: `write:packages`, `read:packages`
4. Скопировать токен

### Шаг 3: Добавить GitHub Secrets (3 мин)

Перейти в Settings → Secrets and variables → Actions

Добавить 4 секрета:

| Имя | Значение |
|-----|----------|
| `PREPROD_HOST` | `51.250.117.178` |
| `PREPROD_USER` | `youredik` |
| `PREPROD_SSH_KEY` | Содержимое `~/.ssh/id_rsa` (весь ключ!) |
| `GHCR_TOKEN` | Токен из шага 2 |

### Шаг 4: Настроить DNS (1 мин)

Добавить A-запись:
```
preprod.stankoff.ru → 51.250.117.178
```

### Шаг 5: Протестировать деплой (5 мин)

После настройки секретов, запустите деплой:

```bash
# Пуш в develop запустит деплой на preprod
git checkout develop
git push origin develop
```

Следите за прогрессом на: https://github.com/youredik/stankoff3/actions

После успешного деплоя, настройте SSL:

```bash
ssh -l youredik 51.250.117.178
cd /opt/stankoff-portal

# Создать скрипт SSL
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
EOF

chmod +x init-ssl.sh
./init-ssl.sh
```

## 📚 Документация

- **Быстрый старт**: [QUICKSTART-DEPLOY.md](QUICKSTART-DEPLOY.md)
- **Полная инструкция**: [docs/DEPLOY.md](docs/DEPLOY.md)
- **Архитектура**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 🔄 Текущий статус

Приложение работает на preprod:
- ✅ Frontend: https://preprod.stankoff.ru
- ✅ Backend: https://preprod.stankoff.ru/api/health
- ✅ SSL: Let's Encrypt (автообновление каждые 12 часов)
- ✅ HTTP/2: Включен
- ✅ TypeORM: Автоматически создает схему БД (TYPEORM_SYNC=true)
- ℹ️ Keycloak: Внешний сервис (не в docker-compose)

## 🚨 Важно

1. **GitHub Secrets** — обязательно добавьте все 4 секрета
2. **SSH Key** — должен включать `-----BEGIN...` и `-----END...`
3. **DNS** — должен быть настроен до получения SSL сертификата
4. **Переменные окружения** — обязательно установите пароли на сервере

---

**Готово к деплою!** Следуйте шагам выше для запуска 🚀
