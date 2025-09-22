#!/usr/bin/env bash
set -euo pipefail
cd /Users/BraxtonEllsworth/Desktop/pcs-ui
set -a
[ -f .env ] && . ./.env || true
[ -f .env.local ] && . ./.env.local || true
set +a
: "${NEXT_PUBLIC_APP_URL:=https://pcsmilesai.com}"
: "${QBO_ENV:=production}"
: "${QBO_SCOPES:=com.intuit.quickbooks.accounting}"
: "${QBO_DB_PATH:=pcs_ai_data/qbo_tokens.db}"
if [ -z "${QBO_STATE_SECRET:-}" ]; then
  QBO_STATE_SECRET=$(tr -dc A-Za-z0-9._- </dev/urandom | head -c 43)
fi
cat > ecosystem.generated.config.js <<EOF
module.exports = {
  apps: [
    {
      name: "pcs-ui",
      script: "./start.sh",
      cwd: "/var/www/pcs-ui",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "${NEXT_PUBLIC_APP_URL}",
        QBO_ENV: "${QBO_ENV}",
        QBO_CLIENT_ID: "${QBO_CLIENT_ID:-}",
        QBO_CLIENT_SECRET: "${QBO_CLIENT_SECRET:-}",
        QBO_REDIRECT_URI: "${QBO_REDIRECT_URI:-}",
        QBO_SCOPES: "${QBO_SCOPES}",
        QBO_STATE_SECRET: "${QBO_STATE_SECRET}",
        QBO_DB_PATH: "${QBO_DB_PATH}"
      }
    }
  ]
};
EOF
