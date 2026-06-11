# QUICKBOOKS_INTEGRATION_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Scope: all QBO functionality — OAuth, token lifecycle, bill creation/sync, webhooks, idempotency, accounting integrity.
> Two QBO implementations exist: the **Next.js** path (`lib/qbo/*`, `app/api/qbo/*`, `app/api/invoices/*`) which is production, and a **legacy** `QBOAuthClient` inside `dev-server.js`. They duplicate logic and can diverge.

---

## 1. OAuth Risks

- **Client secret + state secret committed to git** (`.env`, `production.env`): `QBO_CLIENT_SECRET`, `QBO_STATE_SECRET=pcs-qbo-oauth-state-secret-2024-secure`. Treat as compromised; rotate at Intuit. (SECURITY_AUDIT C2)
- **Environment confusion.** `.env` sets `QBO_ENVIRONMENT=sandbox` while `production.env` sets `QB_ENVIRONMENT=production` with a *different* client id/secret, and code reads `QBO_ENV` in some places (`dev-server.js`) and `QBO_ENVIRONMENT` in others (`pay/route.ts`). Mismatched env vars can point bill creation at sandbox while the UI assumes production (or vice-versa) → bills created in the wrong company.
- **State handling.** `dev-server.js::generateStateToken()` is `'qbo_oauth_' + Date.now() + random` — not cryptographically bound to the session and not verified on callback in that server. The Next.js path has `lib/qbo/stateJwt.ts`/`stateStore.ts` (better), but the callback route is in the no-auth set and should be confirmed to validate state to prevent CSRF/code-injection on the OAuth flow.
- **Manual code-exchange endpoint** (`dev-server.js` `/api/qbo/complete-oauth`) returns access/refresh tokens **in the HTTP response body** with no auth (SECURITY_AUDIT C7).
- **Multiple redirect/callback aliases** (`/callback`, `/qbo/callback`, `/api/qbo/callback`) increase the attack surface and the chance of an unvalidated path handling the code.

## 2. Token Lifecycle Issues

- **Unencrypted at rest** by default (`lib/qbo/tokenStorage.ts`): plaintext in `qbo_tokens.db` (committed) + plaintext JSON mirror. (SECURITY_AUDIT H4/C2)
- **Single-realm collapse.** `getLatestTokens()` returns the newest token across all realms; `getTokens(realmId)` falls back to "any token" if the realm row is missing (`fallbackTokens[0]`). In a multi-company future this would silently use the wrong company's tokens.
- **Refresh races.** `tokenRefreshService.ts` + the recent commit "Reload QBO tokens from disk on 401 before refreshing" indicate refresh-token handling has been fragile. Concurrent requests can each trigger a refresh; Intuit rotates refresh tokens, so the loser of a race may persist a stale/again-rotated token and lock the connection out. No mutex around refresh.
- **JSON/SQLite dual-write drift.** Every save writes both the DB row and `syncJsonToken`; if one write fails the two stores disagree, and `getTokens` may resolve the stale one.

## 3. Sync Failures

- **No inbound sync.** `app/api/qbo/webhooks/route.ts` validates a signature only if `QBO_WEBHOOK_VERIFIER` is set and otherwise just logs (`// later: fetch entity + sync`). Manual QBO bill edits, deletions, or payments are **not** reflected back into PCS AI. (SECURITY_AUDIT H5)
- **Two webhook handlers** (`dev-server.js` also defines `/api/webhooks/quickbooks` twice, the later one unverified and processing events) → ambiguous behavior depending on which server runs.

## 4. Duplicate Transaction Creation

- **No idempotency.** `createBillFromInvoice` does not check QBO for an existing bill by DocNumber before creating. The only guard is `!invoice.qbo_bill_id` in `transition/route.ts`, with **no DB lock/transaction**, so concurrent approvals create duplicate bills (FINANCIAL_CONTROLS §3).
- **Retry endpoints** (`/api/invoices/retry-bills`, `orphaned-bills`) can double-create if the first success didn't persist `qbo_bill_id`.
- **DocNumber truncation/batch-prefix** (21-char cap; pay route prepends `XXX-`) can make distinct invoices collide on DocNumber, defeating QBO's native duplicate detection.

## 5. Retry Failures

- Production Next.js bill creation has **no retry/backoff/circuit-breaker**. The circuit breaker and exponential backoff exist only in `dev-server.js` (`QuickBooksCircuitBreaker`, `retryWithBackoff`), which isn't the production path.
- On QBO 5xx/429 during approval, the bill silently fails and the invoice still advances to `to_be_paid` (no bill) — a latent payable gap, not a retried operation.

## 6. Webhook Failures

- Fails open (returns `ok`) when verifier unset; does nothing when set. No replay protection, no signature timing-safe compare (uses `!==`), no event persistence/deduE.
- **Fix:** require verifier, timing-safe HMAC compare, persist + dedupe events by id, then sync entity state into PCS AI.

## 7. Idempotency Weaknesses (summary)

| Operation | Idempotent? | Mechanism |
|---|---|---|
| Bill creation | ✗ | only `!qbo_bill_id`, no lock, no QBO lookup |
| Bill tagging (pay) | ⚠ | checks DocNumber prefix but races on SyncToken |
| Token save | ✗ | dual-write DB+JSON, no transaction |
| Webhook processing | ✗ | no event dedupe |
| Payment verify cron | ⚠ | depends on QBO Balance; weak auth |

## 8. Accounting Integrity Risks

- **Auto-balancing line** ("Other charges"/"Adjustment to match total") posts the plug amount to an expense/COGS account to force line-sum = total — can misstate expenses and hide parse errors. (`ensureAccountLines`)
- **COGS vs Expense confusion** is detected and only *warned* (`resolvedAccount?.type === 'Cost of Goods Sold'`) — the bill is still created with the wrong account type.
- **Fallback account** = `expenseAccounts[0]` (arbitrary first expense account) when classification fails → systematically miscoded bills.
- **Class/Location resolution is best-effort**; when office is missing, class is dropped, so location reporting silently degrades.
- **Hard-coded account IDs** in `dev-server.js` (`1150040000` "PCS AI Bill", vendor/AP `33`) — fragile, company-specific, and wrong for any other realm.
- **Vendor auto-create** (`ensureVendor`) will create a new QBO vendor on a fuzzy miss, risking duplicate vendor records in QBO.

## 9. Recommendations (priority order)

1. Rotate QBO client secret + all tokens; remove tokens/secrets from git; encrypt tokens at rest. (CRITICAL)
2. Make bill creation idempotent: single DB transaction `check→create→persist` with row lock + QBO DocNumber lookup; idempotency key per invoice. (CRITICAL)
3. Fail-closed on bill-creation failure during approval; add retry/backoff/circuit-breaker to the production QBO client. (HIGH)
4. Implement real webhook verification + inbound sync (bills, payments, deletes) with event dedupe. (HIGH)
5. Replace auto-balancing with a human-review flag on total/line mismatch; never silently create bills with COGS-typed accounts or arbitrary fallback accounts. (HIGH)
6. Unify on one QBO implementation (delete `dev-server.js` QBO paths); standardize on `QBO_ENVIRONMENT`; per-realm token storage for future multi-company. (MEDIUM)
