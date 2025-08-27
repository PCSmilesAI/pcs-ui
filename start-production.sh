#!/bin/bash

# 🚀 PCS AI QuickBooks Integration - Production Startup Script
# =============================================================

set -e  # Exit on any error

echo "🚀 Starting PCS AI QuickBooks Integration in PRODUCTION mode..."
echo "================================================================"

# Check if we're in the right directory
if [ ! -f "dev-server.js" ]; then
    echo "❌ Error: dev-server.js not found. Please run this script from the project root."
    exit 1
fi

# Set production environment variables
export NODE_ENV=production
export PORT=3001
export HOST=0.0.0.0

# Security Settings
export API_KEYS="2c2774895ae438e86c71f7efe5ca9f5f326621c1df399f2d0a4fa7ed124724ba,d156f77282cef33af3a906c6af137f67bb33b6fd26913a406116a9d6ca779d8a"
export SESSION_SECRET="3e10b131d772430f721b24388bb92fa978d037e82ecdd193d2e8264e50050705523375eb75ab514c05b60d7abf70254bde11743609faa0f28eb53520c773327f"
export ENCRYPTION_KEY="36e81c4fa793c1673df8d6dd6c6db856e668ae198d28fae458fcb295ce7d4f5c"

# QuickBooks OAuth Settings (UPDATE THESE WITH YOUR ACTUAL VALUES)
export QBO_CLIENT_ID="your-production-client-id"
export QBO_CLIENT_SECRET="your-production-client-secret"
export QBO_ENVIRONMENT="production"
export WEBHOOK_VERIFICATION_TOKEN="a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a"
export WEBHOOK_SIGNATURE_KEY="a8d2b999f429de47d9446316796a07c488566196377816ddba7e0f014beb1f8a"

# Rate Limiting
export RATE_LIMIT_WINDOW_MS=900000
export RATE_LIMIT_MAX_REQUESTS=100
export ENABLE_RATE_LIMITING=true

# Performance Settings
export MAX_CONCURRENT_REQUESTS=100
export REQUEST_TIMEOUT_MS=30000
export CIRCUIT_BREAKER_THRESHOLD=5
export CIRCUIT_BREAKER_TIMEOUT_MS=60000
export ENABLE_COMPRESSION=true

# Monitoring
export ENABLE_METRICS=true
export METRICS_PORT=9090
export HEALTH_CHECK_INTERVAL=30000
export ENABLE_PERFORMANCE_MONITORING=true

# Logging
export LOG_LEVEL=info
export LOG_FORMAT=json
export ENABLE_CONSOLE_LOGGING=true
export ENABLE_FILE_LOGGING=true
export LOG_FILE_PATH=./logs/app.log

# Backup
export BACKUP_ENABLED=true
export BACKUP_INTERVAL_HOURS=24
export BACKUP_RETENTION_DAYS=30
export BACKUP_STORAGE_PATH=./backups

# Database
export DATABASE_URL="sqlite://./pcs_ai_data/database.sqlite"
export DATABASE_SSL=false
export MAX_DB_CONNECTIONS=10
export DB_CONNECTION_TIMEOUT=30000

# File Upload
export MAX_FILE_SIZE_MB=50
export ALLOWED_FILE_TYPES="pdf,doc,docx"
export UPLOAD_STORAGE_PATH=./uploads
export ENABLE_VIRUS_SCAN=false

# Cache
export ENABLE_CACHE=true
export CACHE_TTL_SECONDS=3600
export REDIS_URL="redis://localhost:6379"
export ENABLE_MEMORY_CACHE=true

# PCS AI Integration
export PCS_AI_API_URL="https://api.pcs-ai.com"
export PCS_AI_API_KEY="your-pcs-ai-api-key"
export PCS_AI_WEBHOOK_URL="https://yourdomain.com/api/webhooks/pcs-ai"
export ENABLE_REALTIME_SYNC=true

# Error Reporting
export SENTRY_DSN="your-sentry-dsn"
export ENABLE_ERROR_REPORTING=true
export ENABLE_ERROR_NOTIFICATIONS=true
export ERROR_NOTIFICATION_EMAIL="admin@yourdomain.com"

# SSL/TLS
export SSL_ENABLED=false
export SSL_CERT_PATH="/path/to/cert.pem"
export SSL_KEY_PATH="/path/to/key.pem"
export ENABLE_HSTS=true
export HSTS_MAX_AGE=31536000

# Security Headers
export ENABLE_HELMET=true
export ENABLE_CORS=true
export CORS_ORIGIN="https://yourdomain.com"

echo "✅ Production environment variables set"
echo "🔒 Security features enabled"
echo "📊 Monitoring enabled"
echo "💾 Database: SQLite"
echo "📁 Logs: ./logs/"
echo "📁 Backups: ./backups/"
echo "📁 Data: ./pcs_ai_data/"
echo "📁 Uploads: ./uploads/"

# Create necessary directories
echo "📁 Creating production directories..."
mkdir -p logs backups pcs_ai_data uploads

# Set proper permissions
echo "🔐 Setting directory permissions..."
chmod 755 logs backups pcs_ai_data uploads

# Check if QuickBooks tokens exist
if [ ! -f "qbo_tokens.json" ]; then
    echo "⚠️  Warning: qbo_tokens.json not found. You may need to authenticate with QuickBooks first."
    echo "   Run the OAuth flow in development mode before starting production."
fi

echo ""
echo "🚀 Starting production server..."
echo "📡 Server will be available at: http://0.0.0.0:3001"
echo "🔍 Health check: http://0.0.0.0:3001/health"
echo "📊 Metrics: http://0.0.0.0:3001/metrics"
echo ""
echo "Press Ctrl+C to stop the server"
echo "================================================================"

# Start the production server
exec node dev-server.js
