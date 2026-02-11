#!/bin/bash
#
# Database Backup Script for Stankoff Portal
# Usage: ./backup.sh [backup|backup-s3|restore|restore-s3|list|list-s3|cleanup|cleanup-s3|scheduled]
#

# Exit on error (disabled in scheduled mode, errors handled explicitly)
set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
RETENTION_HOURS="${RETENTION_HOURS:-168}"  # 7 days in hours for S3
CONTAINER_NAME="${CONTAINER_NAME:-stankoff-postgres}"
DB_NAME="${DATABASE_NAME:-stankoff_portal}"
DB_USER="${DATABASE_USER:-postgres}"

# S3 Configuration
S3_ENDPOINT="${S3_ENDPOINT:-https://storage.yandexcloud.net}"
S3_REGION="${S3_REGION:-ru-central1}"
S3_BUCKET="${S3_BUCKET:-}"
S3_BACKUP_PREFIX="${S3_BACKUP_PREFIX:-backups/postgres}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"

# Telegram Configuration
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Send Telegram notification
notify_telegram() {
    local message="$1"
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -sf -m 10 -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${TELEGRAM_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=HTML" > /dev/null 2>&1 || \
            log_warn "Failed to send Telegram notification"
    fi
}

# Check S3 configuration
check_s3_config() {
    if [ -z "$S3_BUCKET" ] || [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
        log_error "S3 not configured. Set S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY"
        exit 1
    fi
}

# Configure AWS CLI for Yandex S3
configure_aws() {
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
    export AWS_DEFAULT_REGION="$S3_REGION"
}

# Upload file to S3
upload_to_s3() {
    local file="$1"
    local s3_key="${S3_BACKUP_PREFIX}/$(basename "$file")"

    check_s3_config
    configure_aws

    log_info "Uploading to S3: s3://${S3_BUCKET}/${s3_key}"

    aws s3 cp "$file" "s3://${S3_BUCKET}/${s3_key}" \
        --endpoint-url "$S3_ENDPOINT" \
        --no-progress

    if [ $? -eq 0 ]; then
        log_info "Upload successful: s3://${S3_BUCKET}/${s3_key}"
        return 0
    else
        log_error "Upload failed!"
        return 1
    fi
}

# Download file from S3
download_from_s3() {
    local s3_key="$1"
    local local_file="$2"

    check_s3_config
    configure_aws

    log_info "Downloading from S3: s3://${S3_BUCKET}/${s3_key}"

    aws s3 cp "s3://${S3_BUCKET}/${s3_key}" "$local_file" \
        --endpoint-url "$S3_ENDPOINT" \
        --no-progress

    if [ $? -eq 0 ]; then
        log_info "Download successful: $local_file"
        return 0
    else
        log_error "Download failed!"
        return 1
    fi
}

# Create backup
backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/backup_${DB_NAME}_${timestamp}.sql.gz"

    log_info "Starting backup of database '${DB_NAME}'..."

    # Check if running in Docker
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
        log_info "Creating backup via Docker container..."
        docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$backup_file"
    else
        log_info "Creating backup via local pg_dump..."
        PGPASSWORD="${DATABASE_PASSWORD}" pg_dump -h "${DATABASE_HOST:-localhost}" -U "$DB_USER" -d "$DB_NAME" | gzip > "$backup_file"
    fi

    if [ -f "$backup_file" ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        log_info "Backup created successfully: $backup_file ($size)"

        # Create a latest symlink
        ln -sf "$(basename "$backup_file")" "${BACKUP_DIR}/latest.sql.gz"

        echo "$backup_file"
    else
        log_error "Backup failed!"
        exit 1
    fi
}

# Backup and upload to S3
backup_s3() {
    local backup_file=$(backup)

    if [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
        upload_to_s3 "$backup_file"
    fi
}

# Restore from backup
restore() {
    local backup_file="${1:-${BACKUP_DIR}/latest.sql.gz}"

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi

    log_warn "This will OVERWRITE the current database '${DB_NAME}'!"
    read -p "Are you sure you want to continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled."
        exit 0
    fi

    log_info "Restoring from: $backup_file"

    # Check if running in Docker
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
        log_info "Restoring via Docker container..."

        # Drop and recreate database
        docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS ${DB_NAME};" postgres
        docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -c "CREATE DATABASE ${DB_NAME};" postgres

        # Restore
        gunzip -c "$backup_file" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"
    else
        log_info "Restoring via local psql..."

        # Drop and recreate database
        PGPASSWORD="${DATABASE_PASSWORD}" psql -h "${DATABASE_HOST:-localhost}" -U "$DB_USER" -c "DROP DATABASE IF EXISTS ${DB_NAME};" postgres
        PGPASSWORD="${DATABASE_PASSWORD}" psql -h "${DATABASE_HOST:-localhost}" -U "$DB_USER" -c "CREATE DATABASE ${DB_NAME};" postgres

        # Restore
        gunzip -c "$backup_file" | PGPASSWORD="${DATABASE_PASSWORD}" psql -h "${DATABASE_HOST:-localhost}" -U "$DB_USER" -d "$DB_NAME"
    fi

    log_info "Restore completed successfully!"
}

# Restore from S3
restore_s3() {
    local s3_file="${1:-}"

    check_s3_config
    configure_aws

    if [ -z "$s3_file" ]; then
        # Get latest backup from S3
        log_info "Finding latest backup in S3..."
        s3_file=$(aws s3 ls "s3://${S3_BUCKET}/${S3_BACKUP_PREFIX}/" \
            --endpoint-url "$S3_ENDPOINT" \
            | sort | tail -1 | awk '{print $4}')

        if [ -z "$s3_file" ]; then
            log_error "No backups found in S3"
            exit 1
        fi

        s3_file="${S3_BACKUP_PREFIX}/${s3_file}"
    fi

    local local_file="${BACKUP_DIR}/$(basename "$s3_file")"

    download_from_s3 "$s3_file" "$local_file"

    if [ -f "$local_file" ]; then
        restore "$local_file"
    fi
}

# List backups
list() {
    log_info "Available backups in ${BACKUP_DIR}:"
    echo ""

    if ls "${BACKUP_DIR}"/backup_*.sql.gz 1> /dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}"/backup_*.sql.gz | awk '{print $9, $5, $6, $7, $8}'
        echo ""
        local count=$(ls -1 "${BACKUP_DIR}"/backup_*.sql.gz | wc -l)
        log_info "Total: $count backup(s)"
    else
        log_warn "No backups found."
    fi
}

# List S3 backups
list_s3() {
    check_s3_config
    configure_aws

    log_info "Available backups in S3 (s3://${S3_BUCKET}/${S3_BACKUP_PREFIX}/):"
    echo ""

    aws s3 ls "s3://${S3_BUCKET}/${S3_BACKUP_PREFIX}/" \
        --endpoint-url "$S3_ENDPOINT" \
        --human-readable

    echo ""
    local count=$(aws s3 ls "s3://${S3_BUCKET}/${S3_BACKUP_PREFIX}/" \
        --endpoint-url "$S3_ENDPOINT" | wc -l)
    log_info "Total: $count backup(s) in S3"
}

# Cleanup old backups
cleanup() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."

    local count=0
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            log_info "Deleting: $file"
            rm -f "$file"
            ((count++)) || true
        fi
    done < <(find "${BACKUP_DIR}" -name "backup_*.sql.gz" -mtime +${RETENTION_DAYS} 2>/dev/null)

    if [ $count -eq 0 ]; then
        log_info "No old backups to clean up."
    else
        log_info "Deleted $count old backup(s)."
    fi
}

# Cleanup old S3 backups
cleanup_s3() {
    check_s3_config
    configure_aws

    log_info "Cleaning up S3 backups older than ${RETENTION_DAYS} days..."

    local cutoff_date=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)
    local count=0

    aws s3 ls "s3://${S3_BUCKET}/${S3_BACKUP_PREFIX}/" \
        --endpoint-url "$S3_ENDPOINT" | while read -r line; do

        local file_date=$(echo "$line" | awk '{print $1}')
        local file_name=$(echo "$line" | awk '{print $4}')

        if [ -n "$file_name" ] && [[ "$file_date" < "$cutoff_date" ]]; then
            log_info "Deleting S3: ${S3_BACKUP_PREFIX}/${file_name}"
            aws s3 rm "s3://${S3_BUCKET}/${S3_BACKUP_PREFIX}/${file_name}" \
                --endpoint-url "$S3_ENDPOINT"
            ((count++)) || true
        fi
    done

    log_info "S3 cleanup completed."
}

# Scheduled backup (for cron - backup + upload + cleanup)
scheduled() {
    log_info "=== Starting scheduled backup ==="

    # Disable exit-on-error to handle failures gracefully
    set +e

    local start_time=$(date +%s)

    # Create backup and upload to S3
    if ! backup_s3; then
        local error_msg="<b>BACKUP FAILED</b>
DB: ${DB_NAME}
Host: $(hostname)
Time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
        notify_telegram "$error_msg"
        log_error "Scheduled backup FAILED"
        exit 1
    fi

    # Cleanup old local backups
    cleanup

    # Cleanup old S3 backups
    cleanup_s3

    local end_time=$(date +%s)
    local duration=$(( end_time - start_time ))
    local size=$(du -h "${BACKUP_DIR}/latest.sql.gz" 2>/dev/null | cut -f1 || echo "N/A")

    local success_msg="<b>Backup OK</b>
DB: ${DB_NAME} (${size})
Duration: ${duration}s
Time: $(date '+%H:%M %Z')"
    notify_telegram "$success_msg"

    log_info "=== Scheduled backup completed in ${duration}s ==="
}

# Main
case "${1:-backup}" in
    backup)
        backup
        ;;
    backup-s3)
        backup_s3
        ;;
    restore)
        restore "$2"
        ;;
    restore-s3)
        restore_s3 "$2"
        ;;
    list)
        list
        ;;
    list-s3)
        list_s3
        ;;
    cleanup)
        cleanup
        ;;
    cleanup-s3)
        cleanup_s3
        ;;
    scheduled)
        scheduled
        ;;
    *)
        echo "Usage: $0 [backup|backup-s3|restore|restore-s3|list|list-s3|cleanup|cleanup-s3|scheduled]"
        echo ""
        echo "Commands:"
        echo "  backup          Create a local backup"
        echo "  backup-s3       Create backup and upload to S3"
        echo "  restore [file]  Restore from local backup (defaults to latest)"
        echo "  restore-s3 [key] Restore from S3 backup (defaults to latest)"
        echo "  list            List local backups"
        echo "  list-s3         List S3 backups"
        echo "  cleanup         Remove old local backups"
        echo "  cleanup-s3      Remove old S3 backups"
        echo "  scheduled       Full backup cycle (backup + s3 upload + cleanup)"
        echo ""
        echo "Environment variables:"
        echo "  BACKUP_DIR       Local backup directory (default: ./backups)"
        echo "  RETENTION_DAYS   Days to keep backups (default: 7)"
        echo "  CONTAINER_NAME   Docker container name (default: stankoff-postgres)"
        echo "  DATABASE_NAME    Database name (default: stankoff_portal)"
        echo "  DATABASE_USER    Database user (default: postgres)"
        echo "  DATABASE_PASSWORD  Database password"
        echo "  DATABASE_HOST    Database host (default: localhost)"
        echo ""
        echo "S3 Configuration:"
        echo "  S3_ENDPOINT      S3 endpoint (default: https://storage.yandexcloud.net)"
        echo "  S3_REGION        S3 region (default: ru-central1)"
        echo "  S3_BUCKET        S3 bucket name (required for S3 commands)"
        echo "  S3_BACKUP_PREFIX S3 key prefix (default: backups/postgres)"
        echo "  S3_ACCESS_KEY    S3 access key (required for S3 commands)"
        echo "  S3_SECRET_KEY    S3 secret key (required for S3 commands)"
        echo ""
        echo "Telegram Notifications:"
        echo "  TELEGRAM_BOT_TOKEN  Telegram bot token (optional)"
        echo "  TELEGRAM_CHAT_ID    Telegram chat ID for alerts (optional)"
        exit 1
        ;;
esac
