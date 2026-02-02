#!/bin/bash
set -e

# =============================================
# Stankoff Portal - Production Deployment Script
# =============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check requirements
check_requirements() {
    log_info "Проверка зависимостей..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker не установлен"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose не установлен"
        exit 1
    fi

    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log_error "Файл .env не найден. Скопируйте .env.example в .env и настройте"
        exit 1
    fi

    log_success "Все зависимости установлены"
}

# Validate environment
validate_env() {
    log_info "Проверка переменных окружения..."

    source "$PROJECT_ROOT/.env"

    REQUIRED_VARS=(
        "DATABASE_PASSWORD"
        "JWT_SECRET"
        "S3_BUCKET"
        "S3_ACCESS_KEY"
        "S3_SECRET_KEY"
    )

    MISSING=()
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ] || [ "${!var}" == "your-"* ] || [ "${!var}" == "change-"* ]; then
            MISSING+=("$var")
        fi
    done

    if [ ${#MISSING[@]} -gt 0 ]; then
        log_error "Следующие переменные не настроены в .env:"
        for var in "${MISSING[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi

    log_success "Переменные окружения настроены"
}

# Build images
build() {
    log_info "Сборка Docker образов..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" build --no-cache
    log_success "Образы собраны"
}

# Pull latest images
pull() {
    log_info "Обновление базовых образов..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" pull
    log_success "Образы обновлены"
}

# Start services
start() {
    log_info "Запуск сервисов..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" up -d
    log_success "Сервисы запущены"
}

# Stop services
stop() {
    log_info "Остановка сервисов..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" down
    log_success "Сервисы остановлены"
}

# Restart services
restart() {
    stop
    start
}

# Show status
status() {
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" ps
}

# Show logs
logs() {
    local service="${1:-}"
    cd "$PROJECT_ROOT"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f "$service"
    else
        docker compose -f "$COMPOSE_FILE" logs -f
    fi
}

# Health check
health() {
    log_info "Проверка здоровья сервисов..."

    # Wait for services to be ready
    sleep 5

    # Check backend health
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        log_success "Backend: OK"
    else
        log_error "Backend: FAILED"
    fi

    # Check frontend
    if curl -sf http://localhost > /dev/null 2>&1; then
        log_success "Frontend: OK"
    else
        log_error "Frontend: FAILED"
    fi

    # Check database via backend
    HEALTH_RESPONSE=$(curl -s http://localhost/api/health 2>/dev/null || echo "{}")
    if echo "$HEALTH_RESPONSE" | grep -q '"database":"healthy"'; then
        log_success "Database: OK"
    else
        log_warn "Database: проверьте через docker logs stankoff-backend"
    fi
}

# Initialize SSL certificates
init_ssl() {
    local email="${1:-}"

    if [ -z "$email" ]; then
        log_error "Укажите email: ./deploy.sh init-ssl admin@example.com"
        exit 1
    fi

    log_info "Инициализация SSL сертификатов..."
    "$SCRIPT_DIR/init-ssl.sh" "$email"
}

# Run database migrations
migrate() {
    log_info "Запуск миграций базы данных..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" exec backend npm run migration:run
    log_success "Миграции выполнены"
}

# Create backup
backup() {
    log_info "Создание бэкапа..."
    "$SCRIPT_DIR/backup.sh" backup-s3
    log_success "Бэкап создан"
}

# Restore from backup
restore() {
    local backup_path="${1:-}"

    if [ -z "$backup_path" ]; then
        log_info "Восстановление из последнего бэкапа..."
        "$SCRIPT_DIR/backup.sh" restore-s3
    else
        log_info "Восстановление из $backup_path..."
        "$SCRIPT_DIR/backup.sh" restore-s3 "$backup_path"
    fi
    log_success "Восстановление завершено"
}

# Full deployment
deploy() {
    log_info "=========================================="
    log_info "  Stankoff Portal - Production Deploy"
    log_info "=========================================="

    check_requirements
    validate_env

    log_info "Создание бэкапа перед деплоем..."
    backup || log_warn "Бэкап не удался, продолжаем..."

    pull
    build

    log_info "Перезапуск сервисов..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate

    log_info "Ожидание запуска сервисов..."
    sleep 10

    health

    log_success "=========================================="
    log_success "  Деплой завершён успешно!"
    log_success "=========================================="
    echo ""
    echo "Команды:"
    echo "  ./scripts/deploy.sh status   - статус сервисов"
    echo "  ./scripts/deploy.sh logs     - логи всех сервисов"
    echo "  ./scripts/deploy.sh health   - проверка здоровья"
}

# Update (pull, build, restart)
update() {
    log_info "Обновление приложения..."

    # Pull latest code (if using git)
    if [ -d "$PROJECT_ROOT/.git" ]; then
        log_info "Получение последних изменений из git..."
        cd "$PROJECT_ROOT"
        git pull
    fi

    deploy
}

# Cleanup unused resources
cleanup() {
    log_info "Очистка неиспользуемых ресурсов Docker..."
    docker system prune -f
    docker image prune -f
    log_success "Очистка завершена"
}

# Show help
show_help() {
    echo "Stankoff Portal - Deployment Script"
    echo ""
    echo "Использование: ./deploy.sh <команда> [аргументы]"
    echo ""
    echo "Команды:"
    echo "  deploy      Полный деплой (бэкап, сборка, запуск)"
    echo "  update      Обновление (git pull + deploy)"
    echo "  start       Запустить сервисы"
    echo "  stop        Остановить сервисы"
    echo "  restart     Перезапустить сервисы"
    echo "  status      Показать статус сервисов"
    echo "  logs [svc]  Показать логи (опционально: имя сервиса)"
    echo "  health      Проверка здоровья"
    echo "  build       Собрать Docker образы"
    echo "  init-ssl    Инициализировать SSL (требует email)"
    echo "  backup      Создать бэкап БД в S3"
    echo "  restore     Восстановить БД из S3"
    echo "  cleanup     Очистить неиспользуемые ресурсы"
    echo "  help        Показать эту справку"
    echo ""
    echo "Примеры:"
    echo "  ./deploy.sh deploy"
    echo "  ./deploy.sh logs backend"
    echo "  ./deploy.sh init-ssl admin@stankoff.ru"
}

# Main
case "${1:-help}" in
    deploy)     deploy ;;
    update)     update ;;
    start)      start ;;
    stop)       stop ;;
    restart)    restart ;;
    status)     status ;;
    logs)       logs "$2" ;;
    health)     health ;;
    build)      build ;;
    pull)       pull ;;
    init-ssl)   init_ssl "$2" ;;
    migrate)    migrate ;;
    backup)     backup ;;
    restore)    restore "$2" ;;
    cleanup)    cleanup ;;
    help|*)     show_help ;;
esac
