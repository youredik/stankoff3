#!/bin/bash
set -e

# =============================================
# Скрипт начальной настройки Preprod сервера
# =============================================
# Запустить локально: ./scripts/setup-preprod-server.sh
# Скрипт автоматически подключится к серверу и настроит его

PREPROD_HOST="51.250.117.178"
PREPROD_USER="youredik"
SERVER_DIR="/opt/stankoff-portal"

echo "🚀 Настройка Preprod сервера для Stankoff Portal"
echo "================================================"
echo ""
echo "Сервер: ${PREPROD_USER}@${PREPROD_HOST}"
echo "Директория: ${SERVER_DIR}"
echo ""

# Проверка доступа к серверу
echo "1️⃣ Проверка SSH доступа..."
if ! ssh -o ConnectTimeout=5 -l "${PREPROD_USER}" "${PREPROD_HOST}" "echo 'SSH OK'"; then
    echo "❌ Не удалось подключиться к серверу"
    echo "Проверьте SSH ключ и доступность сервера"
    exit 1
fi
echo "✅ SSH доступ OK"
echo ""

# Установка Docker на сервере (если нужно)
echo "2️⃣ Проверка Docker на сервере..."
ssh -l "${PREPROD_USER}" "${PREPROD_HOST}" << 'ENDSSH'
if ! command -v docker &> /dev/null; then
    echo "📦 Docker не установлен. Устанавливаем..."

    # Обновление пакетов
    sudo apt-get update

    # Установка зависимостей
    sudo apt-get install -y ca-certificates curl gnupg

    # Добавление официального GPG ключа Docker
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    # Добавление репозитория Docker
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Установка Docker Engine
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Добавление пользователя в группу docker
    sudo usermod -aG docker $USER

    echo "✅ Docker установлен"
else
    echo "✅ Docker уже установлен: $(docker --version)"
fi
ENDSSH
echo ""

# Создание директории на сервере
echo "3️⃣ Создание директории ${SERVER_DIR}..."
ssh -l "${PREPROD_USER}" "${PREPROD_HOST}" << ENDSSH
sudo mkdir -p ${SERVER_DIR}
sudo chown ${PREPROD_USER}:${PREPROD_USER} ${SERVER_DIR}
mkdir -p ${SERVER_DIR}/{nginx,scripts,backups}
echo "✅ Директория создана"
ENDSSH
echo ""

# Копирование файлов на сервер
echo "4️⃣ Копирование конфигурационных файлов..."
scp docker-compose.preprod.yml "${PREPROD_USER}@${PREPROD_HOST}:${SERVER_DIR}/"
scp .env.preprod "${PREPROD_USER}@${PREPROD_HOST}:${SERVER_DIR}/.env"
scp nginx/nginx.preprod.conf "${PREPROD_USER}@${PREPROD_HOST}:${SERVER_DIR}/nginx/"
echo "✅ Файлы скопированы"
echo ""

# Генерация секретов
echo "5️⃣ Генерация JWT секретов..."
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

ssh -l "${PREPROD_USER}" "${PREPROD_HOST}" << ENDSSH
cd ${SERVER_DIR}

# Замена секретов в .env
sed -i "s|JWT_SECRET=CHANGE_ME_GENERATE_WITH_OPENSSL|JWT_SECRET=${JWT_SECRET}|g" .env
sed -i "s|JWT_REFRESH_SECRET=CHANGE_ME_GENERATE_WITH_OPENSSL|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|g" .env

echo "✅ JWT секреты сгенерированы"
ENDSSH
echo ""

# Инструкции по дальнейшей настройке
echo "================================================"
echo "✅ Базовая настройка сервера завершена!"
echo ""
echo "📝 Следующие шаги:"
echo ""
echo "1. Настройте переменные окружения в ${SERVER_DIR}/.env:"
echo "   - DATABASE_PASSWORD (пароль PostgreSQL)"
echo "   - KEYCLOAK_ADMIN_PASSWORD (пароль админа Keycloak)"
echo "   - KEYCLOAK_CLIENT_SECRET (секрет клиента Keycloak)"
echo "   - S3_ACCESS_KEY, S3_SECRET_KEY (если используете S3)"
echo "   - SMTP_* (если используете email)"
echo ""
echo "   SSH на сервер:"
echo "   ssh -l ${PREPROD_USER} ${PREPROD_HOST}"
echo "   nano ${SERVER_DIR}/.env"
echo ""
echo "2. Настройте DNS для preprod.stankoff.ru -> ${PREPROD_HOST}"
echo ""
echo "3. Настройте GitHub Secrets (см. docs/DEPLOY.md):"
echo "   - PREPROD_HOST=${PREPROD_HOST}"
echo "   - PREPROD_USER=${PREPROD_USER}"
echo "   - PREPROD_SSH_KEY (содержимое приватного SSH ключа)"
echo "   - GHCR_TOKEN (Personal Access Token с доступом к пакетам)"
echo ""
echo "4. Создайте ветку develop и запушьте туда изменения:"
echo "   git checkout -b develop"
echo "   git push -u origin develop"
echo ""
echo "5. GitHub Actions автоматически задеплоит на preprod"
echo ""
echo "================================================"
