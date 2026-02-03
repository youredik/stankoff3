#!/bin/bash
#
# Скрипт автоматического деплоя Keycloak темы на сервер
# Использование: ./deploy.sh
#

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Конфигурация
THEME_NAME="stankoff-portal"
KEYCLOAK_HOST="new.stankoff.ru"
KEYCLOAK_USER="youredik"  # Измените на правильного пользователя
KEYCLOAK_THEMES_DIR="/opt/keycloak/themes"  # Путь к директории themes в Keycloak

# Текущая директория (keycloak-theme)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}  Деплой Keycloak темы '${THEME_NAME}'${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

# Проверка что мы в правильной директории
if [ ! -d "${SCRIPT_DIR}/${THEME_NAME}" ]; then
    echo -e "${RED}❌ Ошибка: Директория темы '${THEME_NAME}' не найдена${NC}"
    echo -e "${YELLOW}Убедитесь что вы запускаете скрипт из директории keycloak-theme/${NC}"
    exit 1
fi

# Шаг 1: Создание JAR архива
echo -e "${YELLOW}📦 Шаг 1: Создание JAR архива...${NC}"
cd "${SCRIPT_DIR}"
jar -cvf "${THEME_NAME}-theme.jar" -C "${THEME_NAME}" . > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ JAR архив создан: ${THEME_NAME}-theme.jar${NC}"
else
    echo -e "${RED}❌ Ошибка создания JAR архива${NC}"
    exit 1
fi

# Получаем размер JAR файла
JAR_SIZE=$(du -h "${THEME_NAME}-theme.jar" | cut -f1)
echo -e "${BLUE}  Размер: ${JAR_SIZE}${NC}"
echo ""

# Шаг 2: Копирование темы на Keycloak сервер
echo -e "${YELLOW}📤 Шаг 2: Копирование темы на сервер ${KEYCLOAK_HOST}...${NC}"

# Создаем директорию для темы если не существует
ssh ${KEYCLOAK_USER}@${KEYCLOAK_HOST} "mkdir -p ${KEYCLOAK_THEMES_DIR}/${THEME_NAME}"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Директория на сервере готова${NC}"
else
    echo -e "${RED}❌ Ошибка создания директории на сервере${NC}"
    exit 1
fi

# Копируем тему на сервер
rsync -avz --delete "${SCRIPT_DIR}/${THEME_NAME}/" \
    ${KEYCLOAK_USER}@${KEYCLOAK_HOST}:${KEYCLOAK_THEMES_DIR}/${THEME_NAME}/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Тема скопирована на сервер${NC}"
else
    echo -e "${RED}❌ Ошибка копирования темы${NC}"
    exit 1
fi
echo ""

# Шаг 3: Перезапуск Keycloak (опционально)
echo -e "${YELLOW}🔄 Шаг 3: Применение изменений...${NC}"
echo -e "${BLUE}Keycloak может потребовать перезапуск для применения темы.${NC}"
echo -e "${BLUE}Либо можно использовать hot reload (в development режиме).${NC}"
echo ""

read -p "$(echo -e ${YELLOW}Перезапустить Keycloak? [y/N]: ${NC})" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Перезапуск Keycloak...${NC}"
    ssh ${KEYCLOAK_USER}@${KEYCLOAK_HOST} "sudo systemctl restart keycloak" || \
    ssh ${KEYCLOAK_USER}@${KEYCLOAK_HOST} "docker restart keycloak" || \
    echo -e "${YELLOW}⚠️  Не удалось автоматически перезапустить. Выполните вручную.${NC}"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Keycloak перезапущен${NC}"
    fi
fi
echo ""

# Готово!
echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}✅ Деплой завершён успешно!${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""
echo -e "${BLUE}Тема '${THEME_NAME}' обновлена на сервере ${KEYCLOAK_HOST}${NC}"
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo -e "1. Откройте Keycloak Admin Console: https://${KEYCLOAK_HOST}/oidc/admin"
echo -e "2. Выберите realm 'stankoff-preprod'"
echo -e "3. Realm Settings → Themes → Login Theme: '${THEME_NAME}'"
echo -e "4. Нажмите Save"
echo -e "5. Очистите кэш браузера (Ctrl+Shift+R)"
echo ""
echo -e "${GREEN}Готово! 🎉${NC}"
