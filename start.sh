#!/usr/bin/env bash
set -euo pipefail
cd /var/www/pcs-ui
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi
export NODE_ENV=production
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://pcsmilesai.com}"
export QBO_ENV="${QBO_ENV:-production}"
export QBO_SCOPES="${QBO_SCOPES:-com.intuit.quickbooks.accounting}"
export QBO_DB_PATH="${QBO_DB_PATH:-pcs_ai_data/qbo_tokens.db}"
exec node_modules/next/dist/bin/next start -p 3000
