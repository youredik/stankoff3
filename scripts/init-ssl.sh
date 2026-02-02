#!/bin/bash
#
# Let's Encrypt SSL Certificate Initialization Script
# Usage: ./init-ssl.sh [email]
#
# This script:
# 1. Starts nginx with a minimal config for ACME challenge
# 2. Requests SSL certificate from Let's Encrypt
# 3. Restarts nginx with full SSL config
#

set -e

# Configuration
DOMAIN="${DOMAIN:-bpms.stankoff.ru}"
EMAIL="${1:-admin@stankoff.ru}"
STAGING="${STAGING:-0}"  # Set to 1 for testing with Let's Encrypt staging

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running from project root
if [ ! -f "docker-compose.prod.yml" ]; then
    log_error "Please run this script from the project root directory"
    exit 1
fi

log_info "=== Let's Encrypt SSL Certificate Initialization ==="
log_info "Domain: $DOMAIN"
log_info "Email: $EMAIL"

# Check if certificate already exists
if docker volume inspect stankoff-portal_certbot-conf >/dev/null 2>&1; then
    CERT_EXISTS=$(docker run --rm -v stankoff-portal_certbot-conf:/etc/letsencrypt alpine ls /etc/letsencrypt/live/$DOMAIN/fullchain.pem 2>/dev/null || echo "")
    if [ -n "$CERT_EXISTS" ]; then
        log_warn "Certificate already exists for $DOMAIN"
        read -p "Do you want to force renewal? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Exiting without changes."
            exit 0
        fi
    fi
fi

# Step 1: Use initial nginx config
log_info "Step 1: Starting nginx with initial config..."
cp nginx/nginx.conf nginx/nginx.conf.bak 2>/dev/null || true
cp nginx/nginx-init.conf nginx/nginx.conf

# Create certbot directories
mkdir -p certbot/www certbot/conf

# Step 2: Start nginx only
log_info "Step 2: Starting nginx container..."
docker compose -f docker-compose.prod.yml up -d nginx

# Wait for nginx to start
sleep 5

# Step 3: Request certificate
log_info "Step 3: Requesting SSL certificate from Let's Encrypt..."

STAGING_ARG=""
if [ "$STAGING" = "1" ]; then
    log_warn "Using Let's Encrypt STAGING environment (for testing)"
    STAGING_ARG="--staging"
fi

docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    $STAGING_ARG \
    -d "$DOMAIN"

if [ $? -ne 0 ]; then
    log_error "Failed to obtain certificate!"
    # Restore original config
    cp nginx/nginx.conf.bak nginx/nginx.conf 2>/dev/null || true
    exit 1
fi

# Step 4: Restore full nginx config
log_info "Step 4: Switching to full SSL config..."
cp nginx/nginx.conf.bak nginx/nginx.conf 2>/dev/null || true

# Step 5: Restart all services
log_info "Step 5: Restarting all services..."
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Wait for services to start
log_info "Waiting for services to start..."
sleep 10

# Step 6: Verify
log_info "Step 6: Verifying SSL certificate..."
if curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/health" --connect-timeout 10 2>/dev/null | grep -q "200"; then
    log_info "=== SUCCESS ==="
    log_info "SSL certificate installed and working!"
    log_info "Site: https://$DOMAIN"
else
    log_warn "Could not verify HTTPS. Please check manually: https://$DOMAIN"
fi

# Certificate info
log_info ""
log_info "Certificate details:"
docker compose -f docker-compose.prod.yml run --rm certbot certificates

log_info ""
log_info "=== Setup Complete ==="
log_info "Auto-renewal is configured (certbot runs every 12 hours)"
log_info "Nginx reloads certificates every 6 hours"
