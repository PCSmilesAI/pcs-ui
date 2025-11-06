#!/bin/bash

# 🚀 PCS UI Production Startup Script
# ====================================
#
# ⚠️  SECURITY NOTICE: This script does NOT set secrets.
# All secrets must be configured in /etc/environment before starting.
#
# Required environment variables (set in /etc/environment):
# - SESSION_SECRET
# - ENCRYPTION_KEY
# - QBO_CLIENT_ID
# - QBO_CLIENT_SECRET
# - QBO_REDIRECT_URI
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - SENDGRID_API_KEY

set -e  # Exit on any error

echo "🚀 Starting PCS UI in PRODUCTION mode..."
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Load secrets from /etc/environment
if [ -f "/etc/environment" ]; then
    echo "📂 Loading environment from /etc/environment..."
    set -a
    source /etc/environment
    set +a
else
    echo "⚠️  Warning: /etc/environment not found. Secrets must be set in current shell."
fi

# Validate required secrets are present
REQUIRED_SECRETS=("SESSION_SECRET" "ENCRYPTION_KEY" "QBO_CLIENT_ID" "QBO_CLIENT_SECRET" "QBO_REDIRECT_URI")
MISSING_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ -z "${!secret}" ]; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo "❌ FATAL: Missing required secrets in environment:"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo "  - $secret"
    done
    echo ""
    echo "Set these in /etc/environment and run: source /etc/environment"
    exit 1
fi

echo "✅ All required secrets loaded from environment"

# Set production environment variables
export NODE_ENV=production
export PORT=3000
export HOST=0.0.0.0

# Application Settings (non-secrets)
export LOG_LEVEL=info
export ENABLE_METRICS=true
export METRICS_PORT=9090
export ENABLE_CACHE=true
export CACHE_TTL=300
export MAX_FILE_SIZE=10mb
export UPLOAD_DIR=uploads

echo ""
echo "✅ Production environment configured"
echo "🔒 Secrets loaded from /etc/environment"
echo "📊 Monitoring enabled"
echo "💾 Database: SQLite at /var/www/pcs-ui-data/pcs.db"
echo "📁 Data: /var/www/pcs-ui-data/"
echo ""
echo "🚀 Starting production server..."
echo "📡 Server will be available at: http://0.0.0.0:3000"
echo "🔍 Health check: http://0.0.0.0:3000/api/health"
echo "📊 Ready check: http://0.0.0.0:3000/api/ready"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

# Start the production server with PM2
exec pm2 start ecosystem.config.js --env production --update-env
