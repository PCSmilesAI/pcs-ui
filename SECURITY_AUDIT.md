# SECURITY_AUDIT.md — PCS AI

> Reviewed as a senior application security engineer, 2026-06-11. Findings cite real files/lines.
> Severity: **CRITICAL** (exploitable now, financial/data impact), **HIGH**, **MEDIUM**, **LOW**.
> Headline: identity is forgeable, secrets and live QBO tokens are committed to git, and user credentials are mirrored to a public GitHub Gist. Treat the current production credentials as compromised.

---

## CRITICAL

### C1 — Authentication is a forgeable, unsigned cookie
**Files:** `lib/auth/currentUser.ts`, `app/api/auth/login/route.ts`
`getCurrentUser` derives identity from the `pcs_user` / `loggedInUser` cookie (plain JSON `{email,name}`) or even a `?email=` query parameter. Nothing signs or validates it. Login (`/api/auth/login`) verifies the password but **never creates a server session** — `lib/session/sessionStore.ts` (which would issue an httpOnly random session id) is unused.
**Exploit:** `curl -H 'Cookie: pcs_user={"email":"business@pcsmilesai.com"}' https://pcsmilesai.com/api/...` → full admin. Any user can impersonate any other, including admins.
**Impact:** Complete authentication bypass and privilege escalation across the whole app, including approvals and payment-URL generation.
**Fix:** Issue signed, httpOnly, Secure session cookies via the existing `sessionStore`; look up identity server-side; delete the `?email=` fallback; never trust client-supplied email.

### C2 — Secrets and live QBO tokens committed to git
**Evidence:** `git ls-files` tracks `.env`, `.env.local`, `production.env`, and `pcs_ai_data/qbo_tokens.db`.
`.env`/`production.env` contain `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` (production values), `QBO_STATE_SECRET`, redirect URIs. `qbo_tokens.db` is the **unencrypted** QBO OAuth token store.
**Impact:** Anyone with repo access (or anyone who ever cloned it) can act as the PCS QuickBooks app and, with tokens, access/modify the company's accounting. These must be considered compromised.
**Fix:** Rotate the QBO client secret and all OAuth tokens immediately at Intuit; `git rm --cached` the files, add to `.gitignore` (already partially present but the files were force-added/tracked), purge history (BFG/filter-repo), and move secrets to a secret manager.

### C3 — User credentials mirrored to a PUBLIC GitHub Gist
**Files:** `app/api/gist-users/route.ts`, `app/api/update-gist/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`
The gist `PCSmilesAI/24025555424dd200727b06d461cffdc9/users.json` stores user records including passwords; `fetchUsersFromGist` deliberately **falls back to the unauthenticated public raw URL**. Login compares against gist entries and even supports **legacy plaintext** passwords (`gistUser.password === password`).
**Impact:** The user list (and at least some plaintext passwords / bcrypt hashes) is publicly retrievable on the internet. Offline cracking + credential stuffing.
**Fix:** Delete the gist, rotate all passwords, remove the Gist code paths entirely; SQLite `users` is already the source of truth.

### C4 — `/api/update-gist` rewrites the entire user store with no authentication
**File:** `app/api/update-gist/route.ts`
`POST` accepts `{ users }` and PATCHes the gist with no `getCurrentUser`/admin check (only requires the server's `GITHUB_TOKEN` to exist).
**Exploit:** Anyone can overwrite all users — lock everyone out, or inject an attacker-controlled admin account that then logs in via the gist fallback.
**Fix:** Remove the endpoint (preferred) or require authenticated admin + CSRF.

### C5 — Approval & QBO bill creation use forgeable identity and skip engine RBAC
**File:** `app/api/invoices/transition/route.ts`
The route calls `approveAP/approveOffice/approveAdmin` **directly**, bypassing `lib/workflow/engine.ts::ensureRole()`. Identity comes from C1's cookie. Only the admin branch and `mark_paid` re-check `isAdmin` (against the forgeable email).
**Exploit:** Forge the admin cookie → approve any invoice straight to `to_be_paid` and create a real QBO Bill; or as any authenticated user push invoices through the AP/office stages without holding those roles.
**Impact:** Approval-control bypass; unauthorized creation of payable QBO bills (fraud vector).
**Fix:** Route all transitions through `engine.transition()` (which enforces roles) using a server-validated session identity.

### C6 — Self-service admin via hard-coded signup code
**File:** `app/api/auth/signup/route.ts`
`adminCode === 'PCSADMIN2024'` ⇒ role `admin`; `'PCSAP2024'` ⇒ `ap_manager`. The code is in source (and git history).
**Fix:** Remove code-based elevation; provision elevated roles only via authenticated admin action.

### C7 — Legacy `dev-server.js` exposes unauthenticated financial/OAuth endpoints
**File:** `dev-server.js`
`validateAPIKey` middleware is registered at line ~2634, **after** many routes are already defined, so earlier endpoints are unprotected — including `POST /update-invoice-status`, `POST /remove-invoice` (deletes invoice + files), `POST /api/qbo/process-invoice`, `POST /api/qbo/complete-oauth` (returns access/refresh tokens in the response body), and `POST /api/webhooks/quickbooks` (**no signature check**, processes events). `/api/qbo/debug-env` leaks env.
**Impact:** If this process is reachable in prod, it is a direct, unauthenticated path to mutate invoices and obtain QBO tokens.
**Fix:** Do not run `dev-server.js` in production; if needed, put `validateAPIKey` first and verify webhook signatures.

---

## HIGH

### H1 — Unauthenticated read of any invoice / financial data
**Files:** `app/api/invoices/[id]/route.ts` (GET, no auth), plus the many no-auth routes (`app/api/invoices/visible`, `qbo/get-bill`, `vendors/*`, `qbo/chart-of-accounts`, etc.). `GET /api/invoices/[id]` returns full invoice incl. amounts, vendor, allocations to any caller by id or invoice_number.
**Fix:** Require authenticated session + tenant/role scoping on every data route.

### H2 — Unauthenticated PDF download of financial documents
**File:** `app/api/pdf/[filename]/route.ts` — filename sanitization exists but **no auth**. Invoice PDFs (bank details, amounts) are retrievable by anyone who can guess/observe a filename (filenames are predictable: `Patterson  Invoice # 3038...pdf`).
**Fix:** Authenticate and authorize PDF access; use unguessable IDs.

### H3 — No CSRF protection on state-changing routes
**Evidence:** Only `app/api/ai-mechanic/revert` and one report route reference CSRF; `lib/middleware/csrf.ts` is otherwise unused. Mutating routes (`transition`, `pay`, `update-role`, `update-gist`, `db/init`, `db/wipe`) accept cookie-authenticated POSTs without a CSRF token. `pcs_user` is set client-side (no SameSite guarantee).
**Fix:** Enforce CSRF (double-submit token) on all mutations, or require an `Authorization` bearer instead of ambient cookies.

### H4 — QBO tokens stored unencrypted at rest
**File:** `lib/qbo/tokenStorage.ts` — default path stores access/refresh tokens in plaintext SQLite + mirrors them to plaintext JSON. Encryption only if `USE_LEGACY_QBO_TOKEN_MANAGER=true` (off by default).
**Fix:** Encrypt tokens with a KMS-managed key; stop writing the JSON mirror.

### H5 — QBO webhook handler is effectively unauthenticated/no-op
**File:** `app/api/qbo/webhooks/route.ts` — if `QBO_WEBHOOK_VERIFIER` is unset it returns `ok` without verifying; even when set it only logs. The `dev-server.js` webhook has no verification and does process events (see C7).
**Fix:** Require the verifier, fail closed, and validate the `intuit-signature` HMAC before any processing.

### H6 — `db/init`, `db/normalize-vendors`, and `lib/db/wipe.ts` are destructive and unauthenticated
**Files:** `app/api/db/init/route.ts`, `app/api/db/normalize-vendors/route.ts`. No auth references. Schema/data mutation reachable by anyone.
**Fix:** Gate behind admin auth + confirmation, or remove from the HTTP surface.

### H7 — Default/weak shared secrets
`QBO_STATE_SECRET=pcs-qbo-oauth-state-secret-2024-secure` (committed), `CRON_SECRET` defaults to `pcs-cron-verify-2024` (`ecosystem.config.js`), admin signup codes in source. Predictable secrets defeat OAuth state and cron protections.
**Fix:** Generate strong random secrets per environment; never commit; no defaults.

### H8 — Privilege escalation via `/api/auth/update-role`
**File:** `app/api/auth/update-role/route.ts` — gated only by `isAdmin(getCurrentUser().email)` (forgeable, C1). With a forged admin cookie, an attacker grants themselves admin permanently in the DB.
**Fix:** Same as C1/C5 — real session + CSRF.

---

## MEDIUM

### M1 — QBO query string interpolation
**File:** `lib/qbo/qboClient.ts` (`findVendorByName`: `... where DisplayName = '${safe}'`, vendor pagination uses interpolated `STARTPOSITION/MAXRESULTS`). Depends on `safe` escaping; injection into QBO's query language is a latent risk if escaping is incomplete.
**Fix:** Centralized strict escaping/whitelisting of all interpolated values.

### M2 — Error/stack and env disclosure
`dev-server.js` returns `error.stack` and `/api/qbo/debug-env`; several routes echo internal messages. Information disclosure aids attackers.
**Fix:** Generic client errors; log details server-side only (some Next routes already do this well — apply uniformly).

### M3 — Verbose secret-adjacent logging
Tokens are logged as `***<last4>` (`dev-server.js`), realm IDs and emails logged widely. Last-4 + volume can aid correlation; logs may persist (`queue_writer.log` is 5 MB).
**Fix:** Scrub tokens entirely from logs; rotate/retain logs securely.

### M4 — Weak password policy / no lockout / no MFA
`change-password` requires only 6 chars; no rate limiting on login, no account lockout, no MFA. Combined with public credential exposure (C3), brute force is trivial.
**Fix:** Strong password policy, login rate-limit + lockout, MFA for admins.

### M5 — `mark_paid` accepts client-supplied amount and Stripe id
**File:** `app/api/invoices/transition/route.ts` (`mark_paid`) — `total` and `stripePaymentId` come from the request body and are written to the invoice/audit without verification against QBO/Stripe.
**Fix:** Reconcile against the authoritative payment record before marking paid.

### M6 — File upload / path handling
Multiple PDF resolution paths build filesystem paths from invoice data. `isPathWithinBase` checks exist but the logic is duplicated and `/api/pdf/` paths skip the base check before directory search. Inconsistent enforcement is fragile.
**Fix:** One vetted path-resolution utility; never accept caller-controlled absolute paths.

---

## LOW

- **L1 — Security headers** set in `middleware.ts` but the matcher **excludes `/api`**, so API responses get no `X-Content-Type-Options`/`X-Frame-Options`/HSTS. Add headers in a shared API wrapper.
- **L2 — `helmet`/`cors({})`** in `dev-server.js` uses permissive CORS (`*`).
- **L3 — Committed binaries/logs** (`*.xlsx`, `log.txt`, `queue_writer.log`, `output_jsons/`, `email_invoices/`) inflate the repo and may contain PII (vendor bank info, emails).
- **L4 — `react-router-dom` + Next App Router** both present; client-side route guards (`RequireAuth.jsx`) are not security boundaries.

---

## Audit Trail Weaknesses
- `invoice_events` captures actions but `actor_email` is the forgeable identity; transitions can be attributed to a spoofed user, so the audit log is **non-repudiable in name only**.
- Audit rows are in the same SQLite DB an admin can edit; no append-only/WORM store, no external SIEM.
- QBO-side changes (manual edits in QBO) are not reconciled back into the audit trail.

**See `TOP_PRIORITY_ACTIONS.md` for remediation order. The first three actions (rotate secrets/tokens, kill the public gist, replace cookie auth) are prerequisites to any production or multi-org use.**
