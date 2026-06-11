# PROJECT_BRAIN.md — PCS AI Engineering Map

> Audit date: 2026-06-11. Scope: full repository at `/Users/BraxtonEllsworth/Desktop/pcs-ui`.
> Purpose: a complete engineering map of PCS AI for onboarding, audit, and remediation.
> Read this with `CURSOR_CONTEXT.md` (compressed quick-reference) and `TOP_PRIORITY_ACTIONS.md` (ranked fixes).

---

## 1. System Purpose

PCS AI is an accounts-payable (AP) automation platform built for **Pacific Crest Smiles (PCS)**, a multi-location dental group (currently ~8–9 clinics in Oregon/Washington). It ingests vendor invoices from email, parses them with OCR + GPT, routes them through an approval workflow, creates **Bills** in QuickBooks Online (QBO), and tracks them through to payment.

**Important reality check vs. the stated ambition.** The audit brief frames PCS AI as a "multi-practice platform operating across many dental *organizations*." The code does not implement that. It is a **single-tenant** application hard-wired to one PCS QuickBooks company and one global roles file. "Multi-practice" in the code means *multiple clinic locations of the same company* (modeled as QBO Classes/Departments), not multiple customers. There is no `organization_id`/`tenant_id` anywhere. See `MULTI_TENANT_AUDIT.md`.

---

## 2. Major Modules

| Module | Location | Responsibility |
|---|---|---|
| Next.js App Router UI | `app/*Page/`, `src/ui-pages/` | All operator screens (queue, for-me, to-be-paid, complete, vendors, reports, roles, QBO export) |
| Next.js API routes | `app/api/**/route.ts` (129 routes) | The live backend. Auth, invoices, QBO, vendors, payments, AI parsing |
| Auth & RBAC | `lib/auth/`, `lib/authz/`, `lib/workflow/rolesStore.ts`, `lib/session/` | User store (SQLite), permission matrices, roles file |
| Invoice domain | `lib/invoices/` | DB store, state machine, materialization, vendor matching, dedup tombstones |
| Workflow engine | `lib/workflow/` | Approval transitions, routing, roles config |
| QBO integration | `lib/qbo/`, `src/qbo/`, `src/utils/` | OAuth, token storage, bill creation, vendor/account/class lookup |
| Payments | `lib/payments/`, `app/api/invoices/pay/`, `app/api/stripe/*` (stubs) | QBO Bill-Pay redirect URLs, vendor ACH/Stripe metadata |
| AI parsing | `lib/gpt/`, `*.py` parsers, `email_ingestion_agent*.py` | GPT/OCR parsing, per-vendor parsers, knowledge base |
| Legacy Express server | `dev-server.js` (3,800 lines), `database.js` | Older standalone QBO server; dev/secondary, NOT the production process |
| Email proxy | `pcs-email-proxy/` | Mailjet-based outbound email helper |

---

## 3. Application Architecture

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript, Tailwind. Production process is `next start` (see `ecosystem.config.js` → `npm run start`).
- **Runtime:** Single Node process under PM2 on a DigitalOcean droplet (`159.65.181.148`), plus a `payment-verifier` cron app (`scripts/cron-verify-payments.js`, every 15 min).
- **Two backends coexist:**
  1. **Next.js API routes** (`app/api`) — the *real* production backend.
  2. **`dev-server.js`** — a separate Express server (port 3001) with its own QBO OAuth client and unauthenticated financial endpoints. Invoked via `npm run dev:api` / `start:prod`. It is legacy but still present and runnable; several of its endpoints are dangerous (see SECURITY_AUDIT).
- **Client-heavy logic:** Much of `src/` is a legacy Vite/React-Router SPA (`src/ui-pages/*.jsx`, `src/context/*`). The App Router pages (`app/*Page/page.tsx`) wrap or re-implement these. There is meaningful duplication between `src/` and `app/` (see TECHNICAL_DEBT_AUDIT).

---

## 4. Database Architecture

- **Primary store:** SQLite via `better-sqlite3`, single file `pcs.db` resolved by `lib/workflow/dataDir.ts` → `PCS_DATA_DIR` (prod: `/var/www/pcs-ui-data`). Opened once in `lib/db/client.ts`, WAL mode, `synchronous=NORMAL`.
- **Schema is created/migrated imperatively** in `lib/db/client.ts::runMigrations()` — `CREATE TABLE IF NOT EXISTS` + a long list of `ensureColumn()` ALTERs run lazily on first DB access. No migration history table, no versioning, no down-migrations.
- **Core tables:** `invoices`, `invoice_events` (audit), `tombstones`, `invoice_categories`, `invoice_allocations`, `coding_templates`, `coding_template_locations`, `table_template_rows`, `clinics` (9 seeded locations), `users`, `sessions`, `other_documents`, `receipts`, `vendor_knowledge_bases`, `system_prompts`, `rate_limits`.
- **Second SQLite DB:** `pcs_ai_data/qbo_tokens.db` (via `sqlite3`, not better-sqlite3) holds QBO OAuth tokens, **unencrypted**, and is mirrored to plaintext JSON. This file is **committed to git**.
- **JSON file stores (still active):** `roles.json` (RBAC), `vendor_payments.json`, `vendor_stripe_map.json`, `office_info.json`, `invoice_queue.json` (+ timestamped backups), plus many `output_jsons/*.json` parser outputs. The system straddles a half-finished JSON→SQLite migration (`lib/db/migrate-from-json.ts`, `scripts/restore-invoices-from-queue.js`).
- **No tenant column.** No `organization_id`. `office_id`/`clinic_id` are the only location scoping and are not security boundaries.

### Key invoice columns (selected)
`id` (PK), `invoice_number` (**globally UNIQUE**), `source_message_id` (UNIQUE), parsed/corrected/effective `vendor_name|office_id|amount_cents`, `status`, `approvals` (JSON), multi-stage approval timestamps (`coded_*`, `ap_approved_*`, `om_approved_*`, `admin_approved_*`, `paid_*`), `qbo_bill_id`, `stripe_transfer_id`, `payment_started_by/at` (payment lock), `field_locks` (JSON), `deleted` (soft delete).

---

## 5. API Architecture

- **129 route handlers** under `app/api/**/route.ts`. No shared router, no global auth middleware — `middleware.ts`'s matcher **explicitly excludes `/api`** (`'/((?!api|_next/...).*)'`), so security headers and any edge logic never touch API routes.
- **Auth is per-route and inconsistent.** Three different mechanisms coexist:
  1. `getCurrentUser(req)` reading an **unsigned `pcs_user`/`loggedInUser` cookie** (or `?email=` query param) — `lib/auth/currentUser.ts`.
  2. `rolesStore.isAdmin/isAP/officesForManager` reading `roles.json`.
  3. `lib/authz/allow.ts` permission matrix + `lib/session/*` SQLite sessions — **both largely unused by live routes** (dead security code).
- Of 129 routes, ~63 call `getCurrentUser`; the remainder reference no auth helper at all (including financially sensitive ones — see SECURITY_AUDIT §"Unauthenticated endpoints").
- Response convention: `NextResponse.json`, frequently `{ ok: true/false, ... }`. Many routes `export const dynamic = 'force-dynamic'`.

---

## 6. Authentication Architecture

- **Login** (`app/api/auth/login/route.ts`): verifies email+password against SQLite `users` (bcrypt), falling back to a **public GitHub Gist** of users for migration. On success it returns the user JSON **but does not set any server session cookie**. `lib/session/sessionStore.ts` (SQLite-backed sessions, secure cookie) exists but is **never called by login** → effectively dead.
- **Effective session = client-set cookie.** The browser stores `pcs_user`/`loggedInUser` (email+name) after login; `getCurrentUser` trusts it verbatim. There is no signature, no HMAC, no server-side session lookup, no expiry binding. Identity is fully client-controlled.
- **Seeding:** `seedEssentialUsers()` creates 3 hard-coded admin emails using `ADMIN_SEED_PASSWORD` env on first login/signup.
- **Signup** (`/api/auth/signup`): self-service; passing hard-coded `adminCode` `PCSADMIN2024` grants `admin`, `PCSAP2024` grants `ap_manager`.
- **User credential mirror:** `/api/gist-users` + `/api/update-gist` read/write a **public** GitHub Gist (`PCSmilesAI/24025555424dd200727b06d461cffdc9`) containing user records including password values (some legacy plaintext).

---

## 7. Authorization Architecture

- **Roles** live in `roles.json` (`lib/workflow/rolesStore.ts`): `admins[]`, `ap_authorizers[]`, `office_managers{ office: emails[] }`, `vendor_access`, `threshold_usd` (default $1000), `test_mode_route_all_to_admin` (default **true**).
- Three overlapping role models that disagree:
  - `lib/auth/permissions.ts` roles: `admin | ap_manager | office_manager | viewer`.
  - `lib/authz/allow.ts` roles: `ap | office_manager | admin | viewer` (different string, separate matrix).
  - `lib/auth/currentUser.ts` hard-codes a 3-email `ADMIN_EMAILS` set.
- **The live workflow route bypasses the engine's RBAC.** `lib/workflow/engine.ts::transition()` enforces roles via `ensureRole()`, but `app/api/invoices/transition/route.ts` calls `approveAP/approveOffice/approveAdmin` **directly**, skipping `ensureRole`. Only the admin and `mark_paid` branches re-check `isAdmin`. See FINANCIAL_CONTROLS_AUDIT.

---

## 8. Multi-Practice (Location) Architecture

- "Practices" = **clinic locations of one company**, seeded in the `clinics` table (Longview, Hazel Dell, Ridgefield, Eugene, Lebanon, Milwaukie, Snohomish, 15th St Vancouver, Salem) and referenced as QBO **Classes** (`General-<Office>`) and **Departments/Locations**.
- Office managers are scoped to office names in `roles.json`. There is **no row-level tenant isolation** — all invoices live in one table queried without any tenant filter. Location is a reporting/coding dimension, not a security boundary.
- Multi-location invoices use **coding templates** + `invoice_allocations` to split one invoice across clinics. Such invoices skip office approval and route straight to admin.

---

## 9. Vendor Architecture

- Vendor identity is **string-based** (`vendor_name`), normalized via `lib/invoices/vendorNormalization.ts` / `vendorMatcher.ts` and a fuzzy `findVendorKey`.
- Vendor→QBO mapping for accounts/classes lives in JSON (`vendor_class_category_map.json`, `vendor_class_mapping.json`, `config/qbo_vendor_categories.json`) and `lib/qbo/vendorMappings.ts` / `vendorCategoryMap.ts`.
- Vendor payment metadata (Stripe account id, ACH status) in `vendor_payments.json` / `vendor_stripe_map.json` via `lib/payments/*`.
- QBO vendors are matched/created on demand by `qboClient.ensureVendor()` (exact `DisplayName` query, then fuzzy, then create).
- Per-vendor Python parsers (`patterson_invoice_parser_*`, `henry_parser.py`, `darby_parser.py`, `epic_parser.py`, etc.) plus a GPT generalist path.

---

## 10. Invoice Architecture (Lifecycle)

```
Email (IMAP) ─▶ email_ingestion_agent ─▶ PDF saved (email_invoices/) ─▶ OCR/GPT parse
   ─▶ /api/invoices/gpt-ingest (or ingest) ─▶ invoices row (status=incoming)
   ─▶ categorize / coding template ─▶ approve (AP→office/admin) ─▶ to_be_paid
   ─▶ QBO Bill created on transition to to_be_paid ─▶ /api/invoices/pay (QBO Bill-Pay URL)
   ─▶ mark_paid / cron payment verification ─▶ paid
```

- Canonical states (`lib/invoices/stateMachine.ts`): `incoming, categorized, coded, awaiting_office_approval, awaiting_admin_approval, to_be_paid, paid, rejected, repair, removed`.
- Effective fields are *materialized* (`corrected_* ?? parsed_*`) by `lib/invoices/materialize.ts`.
- Dedup: `tombstones` table (prevents re-ingest of rejected) + ingest-time checks on `source_file`/`invoice_number`+vendor. **Conflict:** schema makes `invoice_number` globally UNIQUE while app logic dedups on `invoice_number`+vendor (see BUG_CATALOG).

---

## 11. Approval Architecture

- Two approval tiers + admin: AP authorizer → office manager (if amount < threshold and office known) → admin (if ≥ threshold, multi-location, or no office).
- **`test_mode_route_all_to_admin = true`** (default in `roles.json` and `DEFAULT_ROLES`) forces *every* invoice to `awaiting_admin_approval`, collapsing the workflow to a single admin approval regardless of amount.
- Admin approval is final and jumps straight to `to_be_paid`, triggering QBO bill creation inline.
- Approval audit: `approvals` JSON on the invoice + `invoice_events` rows + per-stage timestamp/user columns.

---

## 12. QuickBooks Architecture

- **OAuth2** (Intuit) — two implementations: `lib/qbo/oauthClient.ts` + `app/api/qbo/callback` (Next.js, the live one) and a parallel `QBOAuthClient` class inside `dev-server.js`.
- **Tokens:** `lib/qbo/tokenStorage.ts` → `qbo_tokens.db` (unencrypted) + plaintext JSON mirror; optional encrypted legacy manager (`database.js`) only if `USE_LEGACY_QBO_TOKEN_MANAGER=true`. `tokenRefreshService.ts` refreshes; `getLatestTokens()` picks the single most-recent realm (single-company assumption).
- **Bill creation:** `lib/qbo/billCreationService.ts` builds `Bill` payloads (GL line splitting from `invoice_categories`, vendor history account/class, office→Class/Department), attaches the source PDF, and calls `qboClient.createBill`. **No QBO-side idempotency** (does not query existing bill by DocNumber); only guard is `invoice.qbo_bill_id` at the route.
- **Payment:** PCS AI does not move money itself. `/api/invoices/pay` tags the QBO bill's DocNumber with a batch code and returns QBO Bill-Pay **redirect URLs**; humans pay inside QBO. `mark_paid` and a cron (`verify-qbo-payments`) reconcile paid status.
- **Webhooks:** `app/api/qbo/webhooks/route.ts` verifies an HMAC *only if* `QBO_WEBHOOK_VERIFIER` is set (otherwise returns ok) and is otherwise a no-op stub. `dev-server.js` has a second webhook with **no** verification that *does* process events.

---

## 13. AI Workflow Architecture

- **Ingestion agents:** `email_ingestion_agent.py` / `email_ingestion_agent_enhanced.py` (57 KB) poll IMAP, save attachments, detect multi-invoice PDFs (`multi_invoice_detector.py`, `multipage_invoice_processor.py`), and route to vendor parsers (`vendor_router.py`, `enhanced_vendor_router.py`, `vendor_detector.py`).
- **Parsing:** per-vendor Python parsers + a GPT path (`lib/gpt/parseInvoice.ts`, `pdfToImages.ts`, `bulkParse.ts`). A DB-stored **Master Parsing Prompt** and per-vendor **knowledge bases** (`vendor_knowledge_bases`) drive GPT extraction. Admin corrections feed `lib/gpt/historyAutoAdd.ts` and `/api/ai/train-parser`.
- **Classification:** `lib/gpt/documentClassifier.ts`, `invoice_categorizer.py`, `lib/categorize.ts`, `historicalCategorizer.ts`.
- **AI Mechanic:** `app/admin/ai-mechanic` + `/api/ai-mechanic/audit|revert` — an LLM-driven self-modification/repair tool pointed at a Mac Mini (`MECHANIC_BASE_URL=http://100.82.172.44:8001`). High-risk surface.

---

## 14. File Storage Architecture

- Invoice PDFs: `email_invoices/` (1,285 files), `processed_invoices/`, `sample_invoices_pcs/`, plus `pcs_ui_data/email_invoices/`. Served via `/api/pdf/[filename]` with filename matching but **no authentication**.
- Parser outputs: `output_jsons/` (260+ JSON files committed to the repo).
- Data dir: `PCS_DATA_DIR` (`pcs_ui_data` dev / `/var/www/pcs-ui-data` prod) holds `pcs.db`, roles, queues, vendor maps.
- Excel/reporting artifacts: `pcs_qbo_transactions.xlsx`, `vendor_class_category_map.json`.

---

## 15. External Integrations

| Integration | Purpose | Secrets location |
|---|---|---|
| QuickBooks Online (Intuit) | Bills, vendors, accounts, classes, payments | `.env`/`production.env` (committed), `qbo_tokens.db` (committed) |
| OpenAI | Invoice parsing/classification (`openai` SDK) | `OPENAI_API_KEY` env |
| Stripe | Vendor ACH/Connect metadata (largely stubbed) | `STRIPE_SECRET_KEY` env |
| SendGrid / Nodemailer / Mailjet | Outbound email, vendor onboarding | env / `pcs-email-proxy` |
| IMAP mailbox | Inbound invoice ingestion | env |
| GitHub Gist | User credential mirror (**public gist**) | `GITHUB_TOKEN` env |
| Telegram | Invoice status notifications (`/api/invoice-update-telegram`) | env |
| Local LLM / "AI Mechanic" Mac Mini | Self-repair agent | `MECHANIC_BASE_URL` (Tailscale IP) |

---

## 16. Background Jobs / Queues / State Machines

- **PM2 apps:** `pcs-ui` (web) and `payment-verifier` (`scripts/cron-verify-payments.js`, `*/15 * * * *`) using `CRON_SECRET` (default `pcs-cron-verify-2024`).
- **Inbox watcher:** `pm2-inbox-watcher.config.json` + `email_ingestion_agent*` poll IMAP (`INBOX_SCAN_INTERVAL_MS`).
- **Queue:** `invoice_queue.json` + `lib/queue/invoiceQueue.ts` — file-based, being superseded by SQLite.
- **State machine:** `lib/invoices/stateMachine.ts` (transition table + role gate) — but the live transition route reimplements transitions and partly ignores it.

---

## 17. Critical Business Rules

1. **Roseburg is the billing address, not the service location** — parsers must pick the Ship-To/service location for the QBO Class.
2. Approval threshold `threshold_usd` (default $1000) decides office vs. admin approval — **currently inert** because `test_mode_route_all_to_admin` is true.
3. QBO `DocNumber` (= invoice number) is truncated to 21 chars.
4. Bill lines must reconcile to the invoice total (a balancing "Other charges" line is appended).
5. Vendor names must match an existing QBO vendor list ("Unknown" otherwise).
6. Rejecting an invoice with an existing unpaid QBO bill deletes that bill; paid bills cannot be deleted.

---

## 18. Critical Files

| File | Why critical |
|---|---|
| `lib/auth/currentUser.ts` | Sole identity source for ~63 routes; trusts unsigned cookie |
| `app/api/invoices/transition/route.ts` | Approvals + QBO bill creation; bypasses engine RBAC |
| `lib/qbo/billCreationService.ts` | Builds/creates QBO bills; no QBO-side idempotency |
| `app/api/invoices/pay/route.ts` | Payment URLs + DocNumber batch tagging + payment lock |
| `lib/db/client.ts` | Entire schema + lazy migrations |
| `lib/qbo/tokenStorage.ts` | QBO token persistence (unencrypted) |
| `lib/workflow/rolesStore.ts` / `roles.json` | RBAC source of truth + threshold + test-mode flag |
| `app/api/gist-users` + `/api/update-gist` | User credential store on a public gist (unauth write) |
| `dev-server.js` | Parallel Express backend with unauthenticated financial endpoints |
| `email_ingestion_agent_enhanced.py` | Invoice intake from email |

---

## 19. Single Points of Failure

- **One SQLite file (`pcs.db`)** on one droplet — no replication, backups are ad-hoc JSON snapshots; WAL on a single disk. Corruption or disk loss = total data loss.
- **One QBO connection** (single realm via `getLatestTokens`) — token expiry/refresh failure halts all bill creation and payment URL generation.
- **One Node process** (PM2 fork, `instances: 1`) — no horizontal scaling; in-memory rate-limit/circuit-breaker state is per-process.
- **The unsigned-cookie auth model** — a single forged cookie compromises the whole system (admin).
- **Public GitHub Gist** — third-party availability + a public exposure of credentials.
- **Lazy auto-migration on first DB access** — a bad migration throws but is swallowed; schema drift risks silent breakage.
