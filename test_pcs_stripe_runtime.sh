#!/usr/bin/env bash
set -euo pipefail

# === Config ===
BASE_URL="https://pcsmilesai.com"
BIND_VENDOR_NAME="Henry Schein"
BIND_ALIASES='["Henry schein","HENRY SCHEIN"]'

# === Pre-flight checks ===
if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "ERROR: STRIPE_SECRET_KEY is not set in this terminal session."
  echo "Export it first, e.g.:  export STRIPE_SECRET_KEY='sk_test_...'"
  exit 1
fi

echo "==> 1) Ping PCS Stripe endpoint"
curl -s "${BASE_URL}/api/stripe/ping" | jq || {
  echo "Ping failed. Make sure the server is up."
  exit 1
}

echo "==> 2) Bind vendor -> Stripe account placeholder (status starts as pending)"
# We bind to a placeholder for now; we'll replace it with a real account after creation.
PLACEHOLDER_ACCT="acct_PLACEHOLDER"
curl -s -X POST "${BASE_URL}/api/vendors/bind-account" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
        --arg vendor "${BIND_VENDOR_NAME}" \
        --arg acct "${PLACEHOLDER_ACCT}" \
        --argjson aliases "${BIND_ALIASES}" \
        '{vendor:$vendor, stripeAccountId:$acct, aliases:$aliases}')" \
  | jq

echo "==> 3) Check vendor status BEFORE Stripe events"
curl -s "${BASE_URL}/api/vendors/status" | jq

echo "==> 4) Create a TEST Connect account (Custom) with transfers requested"
ACCT_JSON="$(curl -s https://api.stripe.com/v1/accounts \
  -u "${STRIPE_SECRET_KEY}:" \
  -d type=custom \
  -d country=US \
  -d email=vendor-test@example.com \
  -d 'capabilities[transfers][requested]=true')"
echo "${ACCT_JSON}" | jq
ACCT_ID="$(echo "${ACCT_JSON}" | jq -r '.id')"
if [[ -z "${ACCT_ID}" || "${ACCT_ID}" == "null" ]]; then
  echo "ERROR: Failed to create Stripe account."
  exit 1
fi
echo "Created Connect account: ${ACCT_ID}"

echo "==> 5) Update PCS binding to use the REAL test Connect account"
curl -s -X POST "${BASE_URL}/api/vendors/bind-account" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
        --arg vendor "${BIND_VENDOR_NAME}" \
        --arg acct "${ACCT_ID}" \
        --argjson aliases "${BIND_ALIASES}" \
        '{vendor:$vendor, stripeAccountId:$acct, aliases:$aliases}')" \
  | jq

echo "==> 6) Create a TEST bank account token"
BANK_TOK_JSON="$(curl -s https://api.stripe.com/v1/tokens \
  -u "${STRIPE_SECRET_KEY}:" \
  -d 'bank_account[country]=US' \
  -d 'bank_account[currency]=usd' \
  -d 'bank_account[account_holder_name]=Test Vendor' \
  -d 'bank_account[account_holder_type]=company' \
  -d 'bank_account[routing_number]=110000000' \
  -d 'bank_account[account_number]=000123456789')"
echo "${BANK_TOK_JSON}" | jq
BANK_TOK="$(echo "${BANK_TOK_JSON}" | jq -r '.id')"
if [[ -z "${BANK_TOK}" || "${BANK_TOK}" == "null" ]]; then
  echo "ERROR: Failed to create bank token."
  exit 1
fi
echo "Bank token: ${BANK_TOK}"

echo "==> 7) Attach external bank account to the test Connect account (fires connect webhooks)"
EXT_JSON="$(curl -s https://api.stripe.com/v1/accounts/${ACCT_ID}/external_accounts \
  -u "${STRIPE_SECRET_KEY}:" \
  -d external_account="${BANK_TOK}")"
echo "${EXT_JSON}" | jq

echo "==> 8) (Optional) Accept TOS + fill minimal profile so account.updated fires repeatedly"
curl -s https://api.stripe.com/v1/accounts/${ACCT_ID} \
  -u "${STRIPE_SECRET_KEY}:" \
  -d business_type=company \
  -d 'business_profile[url]=https://pcsmilesai.com' \
  -d "tos_acceptance[date]=$(date +%s)" \
  -d "tos_acceptance[ip]=127.0.0.1" | jq

echo "==> 9) Poll PCS status for ACH update (should be 'pending' once external bank exists)"
# Logic in PCS marks:
#  - complete if transfers===active AND external_accounts > 0
#  - pending if transfers===active OR external_accounts > 0
# We attached an external account, so expect at least 'pending'.
tries=10
while (( tries-- > 0 )); do
  STATUS_JSON="$(curl -s "${BASE_URL}/api/vendors/status")"
  echo "${STATUS_JSON}" | jq
  VENDOR_STATUS="$(echo "${STATUS_JSON}" | jq -r --arg v "${BIND_VENDOR_NAME}" '.vendors[$v].ach_status // empty')"
  if [[ "${VENDOR_STATUS}" == "pending" || "${VENDOR_STATUS}" == "complete" ]]; then
    echo "✅ ACH status for '${BIND_VENDOR_NAME}': ${VENDOR_STATUS}"
    break
  fi
  echo "Waiting for webhook to land…"
  sleep 2
done

echo "==> 10) Final debug dump: full vendor map"
curl -s "${BASE_URL}/api/vendors/debug-map" | jq

echo "All done."




