#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Running PCS workflow end-to-end tests..."
node --loader "${PROJECT_ROOT}/scripts/ts-loader.mjs" "${PROJECT_ROOT}/scripts/workflow_e2e_runner.ts"
