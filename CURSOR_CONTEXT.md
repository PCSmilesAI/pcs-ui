# CURSOR_CONTEXT.md — AI-Optimized Repo Guide for PCS AI

> Compressed orientation for AI coding sessions. Read this first; it minimizes tokens vs. re-exploring. Pair with `PROJECT_BRAIN.md` (deep) and `TOP_PRIORITY_ACTIONS.md` (fix order). Audit date 2026-06-11.

## What this is
Single-company AP automation for **Pacific Crest Smiles** (a ~8–9 clinic dental group). Email → parse invoice → approve → create QuickBooks Online **Bill** → pay in QBO. **Not** multi-org/multi-tenant despite the name.

## Stack
Next.js 14 App Router + React 18 + TS + Tailwind. SQLite (`better-sqlite3`) single file `pcs.db`. QBO via `intuit-oauth`/`node-quickbooks`. Python + GPT for parsing. PM2 on a DigitalOcean droplet. Prod process = `next start`. A legacy `dev-server.js` (Express) also exists — **not** prod, but runnable and dangerous.

## Core architecture (where things live)
- **API:** `app/api/**/route.ts` (129 routes). No global middleware for `/api` (matcher in `middleware.ts` excludes it).
- **Auth:** `lib/auth/currentUser.ts` reads an **unsigned cookie** (`pcs_user`) → identity. `lib/session/*` (real sessions) exists but is UNUSED. Login = `app/api/auth/login/route.ts`.
- **RBAC:** `lib/workflow/rolesStore.ts` + `roles.json` (admins / ap_authorizers / office_managers / threshold_usd / `test_mode_route_all_to_admin`). Two other unused role models: `lib/auth/permissions.ts`, `lib/authz/allow.ts`.
- **Invoices:** `lib/invoices/db-store.ts` (CRUD), `stateMachine.ts` (canonical states), `materialize.ts` (corrected??parsed). Schema in `lib/db/client.ts::runMigrations()`.
- **Workflow:** `lib/workflow/engine.ts` (has RBAC) — but the live route `app/api/invoices/transition/route.ts` BYPASSES it.
- **QBO:** `lib/qbo/*` — `tokenStorage.ts` (unencrypted tokens), `billCreationService.ts` (bill build), `qboClient.ts`, `oauthClient.ts`.
- **Payments:** `app/api/invoices/pay/route.ts` returns QBO Bill-Pay URLs (no money moves in-app). Stripe routes are empty stubs.

## Critical business rules
1. **Roseburg = billing address, NOT service location.** Pick Ship-To for the clinic/QBO Class.
2. Invoice number → QBO `DocNumber`, truncated to **21 chars**.
3. Office → QBO **Class** `General-<Office>` and **Department/Location**.
4. Bill lines must sum to invoice total (a balancing line is auto-added — see risks).
5. Approval threshold `threshold_usd` ($1000) is **inert** because `test_mode_route_all_to_admin=true` sends everything to admin.
6. Rejecting an unpaid invoice deletes its QBO bill; paid bills can't be deleted.

## Tenant architecture
NONE. No `organization_id`. "Office"/"clinic" = locations of one company (QBO Classes). All queries are tenant-unscoped. Do not assume isolation.

## Invoice architecture (states)
`incoming → categorized → coded → awaiting_office_approval → awaiting_admin_approval → to_be_paid → paid` (+ `rejected`, `repair`, `removed`). Effective fields = `corrected_* ?? parsed_*`. Money stored as integer `amount_cents` (but bill math uses floats — mind drift).

## Approval architecture
AP → office (if amount<threshold & office known) → admin (if ≥threshold / multi-location / no office). Admin approval is single-step → `to_be_paid` and creates the QBO bill inline. Live route hand-rolls this and skips `engine.ensureRole`.

## QuickBooks architecture
OAuth → tokens in `qbo_tokens.db` (unencrypted, single realm via `getLatestTokens`). On approval→to_be_paid, `createBillFromInvoice` builds + creates a Bill, attaches the PDF. **No idempotency** beyond `!invoice.qbo_bill_id`. Webhook (`app/api/qbo/webhooks`) is a no-op stub.

## Key workflows (entry points)
- Ingest: `POST /api/invoices/gpt-ingest` (and `/ingest`).
- Approve/reject/mark_paid: `POST /api/invoices/transition`.
- Pay: `POST /api/invoices/pay`.
- Roles: `app/api/workflow/roles`, `app/api/auth/update-role`.
- QBO connect: `app/api/qbo/connect` → `callback`.

## HIGH-RISK FILES (touch with care)
- `lib/auth/currentUser.ts` — forgeable identity; do not extend the `?email=` fallback.
- `app/api/invoices/transition/route.ts` — approvals + bill creation; race + RBAC bypass.
- `lib/qbo/billCreationService.ts` — bill build; auto-balancing; no idempotency.
- `lib/qbo/tokenStorage.ts` — secrets; unencrypted; dual-store drift.
- `lib/db/client.ts` — whole schema; lazy migrations swallow errors.
- `app/api/gist-users` + `/api/update-gist` — public credential store, unauth write. (Should be deleted.)
- `dev-server.js` — legacy; unauthenticated financial/OAuth endpoints.

## Development conventions
- Routes return `NextResponse.json({ ok, ... })`; many `export const dynamic='force-dynamic'`.
- DB via `getDatabase()` (singleton, auto-migrates on first call).
- Data dir via `resolveDataPath()` / `PCS_DATA_DIR`.
- Logs are emoji-tagged `console.log('[AREA]', event, {...})`.
- `npm run dev` (Next) / `npm run dev:api` (legacy express). `npm test` is a stub — there are no real tests.

## Architectural constraints / gotchas
- SQLite single-writer; PM2 single instance — no shared state across instances.
- Don't trust client identity; until sessions are fixed, every route is effectively unauthenticated.
- `invoice_number` is globally UNIQUE in schema but dedup logic uses number+vendor — reconcile before changing either.
- Two front-ends (`src/` SPA + `app/`) and two backends — verify which path is live before editing.
- Secrets/tokens are in git — never add more; assume current ones are compromised.

## If you're asked to "make it production/multi-tenant ready"
Order: (1) rotate secrets + replace cookie auth with real sessions; (2) idempotent/transactional bill creation + fail-closed approval; (3) add `organization_id` + Postgres + scoped queries; (4) consolidate to one backend/frontend/RBAC. See `TOP_PRIORITY_ACTIONS.md`.
