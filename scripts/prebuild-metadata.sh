#!/usr/bin/env bash
set -euo pipefail

# Write BUILD_TIME and GIT_COMMIT_SHA into the shared env file used by next.config.js
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/env"

BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

mkdir -p "$ROOT_DIR/scripts" >/dev/null 2>&1 || true
touch "$ENV_FILE"

# Remove existing lines if present, then append fresh values
grep -v '^BUILD_TIME=' "$ENV_FILE" | grep -v '^GIT_COMMIT_SHA=' > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"
{
  echo "BUILD_TIME=$BUILD_TIME"
  echo "GIT_COMMIT_SHA=$GIT_SHA"
} >> "$ENV_FILE"

echo "[prebuild] BUILD_TIME=$BUILD_TIME GIT_COMMIT_SHA=$GIT_SHA written to $ENV_FILE"


