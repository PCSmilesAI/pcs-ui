# BUG_CATALOG.md — PCS AI

> Audit date: 2026-06-11. Each entry: Severity · File · Description · Reproduction · Fix.
> Severity = CRITICAL / HIGH / MEDIUM / LOW. Security-specific issues are cross-referenced to `SECURITY_AUDIT.md`.

---

## CRITICAL

### B1 — Concurrent approval creates duplicate QBO bills (race condition)
- **File:** `app/api/invoices/transition/route.ts` (approve branch), `lib/qbo/billCreationService.ts`
- **Description:** The guard `if (invoice.status === 'to_be_paid' && !invoice.qbo_bill_id)` and the subsequent `createBillFromInvoice` + `saveInvoice` are not in a transaction or lock. Two near-simultaneous approve requests both read `qbo_bill_id = null` and each create a QBO bill.
- **Repro:** Fire two `POST /api/invoices/transition {action:'approve'}` for the same invoice concurrently → two QBO bills, two payables.
- **Fix:** Wrap check→create→persist in a single DB transaction with a row lock; add an idempotency key; query QBO by DocNumber before create.

### B2 — Approval proceeds even when QBO bill creation fails
- **File:** `app/api/invoices/transition/route.ts` lines ~197–227
- **Description:** On failure/exception, the code only logs and continues; `saveInvoice` still sets `status = to_be_paid` with `qbo_bill_id = null`. The invoice looks approved/payable but has no bill; `mark_paid` can still mark it paid.
- **Repro:** Approve while QBO returns 5xx/expired token → invoice in `to_be_paid` with no bill.
- **Fix:** Fail-closed — keep the invoice in its prior state and surface the error; block `mark_paid` without a verified bill.

### B3 — `invoice_number` schema UNIQUE conflicts with vendor-scoped dedup → silent invoice loss
- **File:** `lib/db/client.ts` (`invoice_number TEXT UNIQUE NOT NULL`) vs `app/api/invoices/gpt-ingest/route.ts` (dedup on number+vendor)
- **Description:** Two different vendors legitimately using the same invoice number (e.g., "1001") collide on the global UNIQUE constraint; the second insert throws and the invoice is dropped or hacked with a suffix.
- **Repro:** Ingest invoice "1001" for Vendor A, then "1001" for Vendor B → constraint failure / lost record.
- **Fix:** `UNIQUE(invoice_number, vendor_name)` (and tenant). Reconcile dedup logic with the constraint.

### B4 — Identity spoofing breaks every approval/payment control (see SECURITY C1/C5)
- **File:** `lib/auth/currentUser.ts`, `app/api/invoices/transition/route.ts`
- **Description:** Forgeable cookie ⇒ `isAdmin` true ⇒ single-handed approve→bill→mark_paid.
- **Fix:** Server-validated sessions; route transitions through `engine.transition()`.

---

## HIGH

### B5 — `status_version` written but never checked (lost updates)
- **File:** `lib/invoices/db-store.ts::saveInvoice` (writes `status_version` but the UPDATE has no `WHERE status_version = ?` guard)
- **Description:** Optimistic-concurrency column exists but is not enforced; two concurrent edits silently overwrite each other.
- **Repro:** Two users edit the same invoice; last write wins, first is lost with no warning.
- **Fix:** Compare-and-swap: `UPDATE ... WHERE id=? AND status_version=?`; reject on mismatch.

### B6 — `getInvoiceById` / `[id]` route match `id OR invoice_number` → ambiguous/incorrect record
- **File:** `lib/invoices/db-store.ts`, `app/api/invoices/[id]/route.ts`
- **Description:** `WHERE id = ? OR invoice_number = ?` with the same value. If an `id` value ever equals another row's `invoice_number`, the wrong invoice is returned/mutated. Also makes enumeration trivial.
- **Fix:** Look up by `id` only on detail/mutation endpoints; separate explicit number lookup.

### B7 — QBO token refresh race / dual-store drift
- **File:** `lib/qbo/tokenStorage.ts`, `lib/qbo/tokenRefreshService.ts`
- **Description:** No mutex around refresh; Intuit rotates refresh tokens, so concurrent refreshes can persist a stale token and lock the connection. DB+JSON dual-write can disagree on partial failure. (Recent commit "Reload QBO tokens from disk on 401" is a symptom.)
- **Repro:** Two requests hit an expired token simultaneously → both refresh → one persisted token invalid → subsequent calls 401.
- **Fix:** Single-flight refresh (mutex/lock); one source of truth for tokens.

### B8 — Clinic list vs office-manager list mismatch (mis-routing / unowned clinics)
- **File:** `lib/db/client.ts` (`clinics` seed) vs `roles.json` / `DEFAULT_ROLES` (`office_managers`)
- **Description:** Seeded clinics (Longview, Hazel Dell, Ridgefield, Eugene, Lebanon, Milwaukie, Snohomish, 15th St Vancouver, Salem) do not match office keys (Milwaukie, Roseburg, Eugene, Lebanon, Ridgefield, Riddle, Salem, Columbia). Roseburg/Riddle/Columbia have no clinic row; Longview/Hazel Dell/Snohomish/15th St have no office manager.
- **Repro:** Invoice for "Longview" routes with no office manager; "Roseburg" has managers but no clinic/QBO class mapping.
- **Fix:** Single canonical location list driving clinics, roles, and QBO classes.

### B9 — Auto-balancing line silently alters posted amounts
- **File:** `lib/qbo/billCreationService.ts::ensureAccountLines`
- **Description:** When line totals ≠ invoice total, a plug line ("Other charges"/"Adjustment") is added to force the match, hiding parse errors and miscoding the difference.
- **Fix:** Flag mismatches for human review instead of auto-plugging.

### B10 — `mark_paid` trusts client-supplied total / stripePaymentId
- **File:** `app/api/invoices/transition/route.ts` (mark_paid), `lib/workflow/engine.ts::markPaid`
- **Description:** Paid amount and payment id come from the request body, unverified against QBO/Stripe.
- **Fix:** Reconcile against the authoritative payment before marking paid.

### B11 — DocNumber truncation + batch prefix collision
- **File:** `lib/qbo/billCreationService.ts` (slice(0,21)), `app/api/invoices/pay/route.ts` (`${shortBatchCode}-${docNum}`.slice(0,21))
- **Description:** Long/related invoice numbers collide on the 21-char QBO DocNumber, defeating QBO duplicate detection and corrupting the reference used for payment search.
- **Fix:** Store full invoice number separately; use a stable short unique reference for DocNumber.

---

## MEDIUM

### B12 — Migrations swallow errors → silent schema drift
- **File:** `lib/db/client.ts::getDatabase` (try/catch logs, doesn't throw)
- **Repro:** A failing `ALTER`/`CREATE` leaves the schema partial; later queries fail at runtime instead of at boot.
- **Fix:** Fail fast on migration error; use a versioned migration runner.

### B13 — Inconsistent role string models
- **File:** `lib/auth/permissions.ts` (`ap_manager`) vs `lib/authz/allow.ts` (`ap`) vs `currentUser.ts` `ADMIN_EMAILS`
- **Description:** A permission added in one model isn't honored by code reading another; two models are effectively dead.
- **Fix:** One RBAC module.

### B14 — Office manager `canViewAllInvoices: true` contradicts intended scoping
- **File:** `lib/auth/permissions.ts` lines ~106–126 (comment says "only their own", value is `true`) with no query-level office filter.
- **Fix:** Enforce office scoping in queries; set the flag to match intent.

### B15 — `getTokens(realmId)` falls back to "any" token
- **File:** `lib/qbo/tokenStorage.ts` (`fallbackTokens[0]`)
- **Description:** Missing realm row returns an arbitrary token — wrong-company risk in a multi-realm future; masks misconfig today.
- **Fix:** Return null on realm miss; never substitute another realm's token.

### B16 — Float money handling
- **File:** `lib/qbo/billCreationService.ts` (parseFloat amounts), engine `parseAmount`
- **Description:** Amounts handled as JS floats (`totalAmount / length`, `toFixed(2)`) alongside integer `amount_cents` in the DB — rounding drift across split lines.
- **Fix:** Compute in integer cents end-to-end; distribute remainders deterministically.

### B17 — Empty/stub Stripe routes
- **File:** `app/api/stripe/{connect,webhook,status,ping,payment-history}` are empty directories (no `route.ts`).
- **Description:** UI may reference Stripe flows that 404; ACH/Connect is half-built.
- **Fix:** Remove dead UI affordances or finish the integration.

### B18 — `update-invoice-status` (Next + dev-server) bypasses the state machine
- **File:** `app/api/update-invoice-status/route.ts`, `dev-server.js` `/update-invoice-status`
- **Description:** Sets arbitrary status directly on JSON queue/DB with no transition validation or auth.
- **Fix:** Route through the state machine; authenticate.

### B19 — `fetchQueue.ts` is empty / dangling import surface
- **File:** `fetchQueue.ts` (0 bytes), `src/lib/fetchQueue.ts`
- **Fix:** Remove dead file or implement.

---

## LOW

- **B20** — `VendorDetailPage copy.jsx` and other `*copy*` files shipped (`src/ui-pages/`). Dead duplicates.
- **B21** — Repo root has malformed filenames (`4) \`requirements.txt`, `5. \`requirements.txt`) — accidental commits.
- **B22** — Console-log noise with emojis throughout production paths; large committed logs (`log.txt` 2.5 MB, `queue_writer.log` 5 MB).
- **B23** — `middleware.ts` security headers never apply to `/api` (matcher excludes it).
- **B24** — `formatStatusForDisplay` maps `coded`→"Ready for Review" same as `incoming`, so distinct states look identical in UI (operator confusion; see USER_FLOW_AUDIT).
- **B25** — `seedEssentialUsers` runs on first login/signup guarded by a module-level `let seeded` — resets per process/instance, re-running seeding on every cold start (benign but wasteful; would double-run across multiple instances).

---

### Suggested fix order
B4 → B1/B2 (financial integrity) → B3/B11/B16 (data correctness) → B7/B5 (concurrency) → B8 (routing) → B9/B10/B18 (controls) → remainder. Cross-reference `TOP_PRIORITY_ACTIONS.md`.
