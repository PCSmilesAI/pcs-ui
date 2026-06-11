# ARCHITECTURE_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Evaluated against enterprise / private-equity operational standards for a platform expected to process millions of dollars across many dental organizations.
> Verdict up front: **Not enterprise-ready.** The system works for one company at small scale but has foundational gaps in tenancy, auth, data durability, and consistency that block multi-org scale. Grades below are A–F.

| Dimension | Grade | One-line |
|---|---|---|
| Scalability | D | Single SQLite file, single Node process, file-based stores |
| Reliability | D | No HA, ad-hoc backups, swallowed migrations, no idempotency |
| Maintainability | D+ | Heavy duplication (`src/` vs `app/`, dev-server.js), three RBAC models |
| Separation of concerns | C- | Domain logic mixed into routes; engine RBAC bypassed |
| Modularity | C | Decent `lib/` boundaries undermined by parallel implementations |
| Coupling | D+ | Hard-coded company, emails, account IDs, paths throughout |
| Cohesion | C | `lib/qbo`, `lib/invoices` cohesive; `dev-server.js` is a kitchen sink |
| Enterprise readiness | F | No tenancy, forgeable auth, secrets in git |

---

## 1. Scalability

**Findings**

- **Single SQLite database** (`pcs.db`, `better-sqlite3`, WAL). better-sqlite3 is synchronous and single-writer. Under concurrent approvals/ingestion across many practices this serializes all writes in one process and cannot scale horizontally. (`lib/db/client.ts`)
- **Single Node process** (`ecosystem.config.js`: `instances: 1`, `exec_mode: 'fork'`). Rate limiting, the QBO circuit breaker, and token caches are **in-process** — they neither share nor survive a second instance, so you cannot scale out without correctness regressions.
- **File-based state** (`roles.json`, `invoice_queue.json`, `vendor_payments.json`, `output_jsons/`) uses read-modify-write with `fs.rename` "atomic" writes. Concurrent writers race and clobber; this pattern does not survive multi-instance deployment.
- **Single QBO realm** assumption (`getLatestTokens()` returns the newest token regardless of realm) — one company only. Multi-org requires per-tenant token isolation that does not exist.
- **PDFs and parser JSON committed into the repo / stored on local disk** — 5.1 GB working tree, 1,285 files in `email_invoices/`. No object storage (S3/GCS). Disk-bound and not CDN-served.

**Recommendations:** move to Postgres (row-level tenancy, real concurrency); externalize files to object storage; make rate-limit/circuit-breaker state shared (Redis); per-tenant QBO token rows; stateless app instances behind a load balancer.

---

## 2. Reliability

**Findings**

- **No HA / no replication.** One droplet, one disk, one DB file. Backups are ad-hoc JSON snapshots (`invoice_queue_backup_*.json`) and a `backup` npm script that calls a `dev-server.js` method. No tested restore path.
- **Migrations are lazy and failure-swallowing.** `getDatabase()` runs `runMigrations()` on first access and **catches+logs** errors without aborting (`lib/db/client.ts` lines ~31–41). A partially-applied migration leaves silent schema drift.
- **No idempotency on money-adjacent operations.** QBO bill creation guards only on `invoice.qbo_bill_id` with no DB lock → concurrent approvals can create duplicate bills (see FINANCIAL_CONTROLS_AUDIT). Payment verification and `mark_paid` likewise lack idempotency keys.
- **Error handling masks failures.** QBO bill creation failure during approval is logged but **does not block** the transition to `to_be_paid`; the invoice advances without a bill.
- **Two backends with divergent behavior** (`dev-server.js` vs `app/api`) — whichever is reachable can mutate the same data with different rules.
- Circuit breaker + retry/backoff exist (`dev-server.js`) but only in the legacy server, not the Next.js QBO client paths used in production.

**Recommendations:** managed Postgres with PITR; explicit, versioned, transactional migrations that fail loudly; idempotency keys for bill creation/payment; fail-closed on QBO bill creation during approval; retire `dev-server.js`.

---

## 3. Maintainability

**Findings**

- **Two parallel frontends:** legacy `src/ui-pages/*.jsx` + `src/context` (Vite/React-Router) and `app/*Page/page.tsx` (App Router). `VendorDetailPage copy.jsx` and similar duplicates indicate copy-paste evolution.
- **Three role/permission models** that disagree on role names and matrices (`lib/auth/permissions.ts`, `lib/authz/allow.ts`, `lib/auth/currentUser.ts`). Two are effectively dead.
- **A 3,800-line `dev-server.js`** mixing OAuth, webhooks, file mutation, DB layer, and middleware.
- **Dead/duplicated security scaffolding:** `lib/session/*`, `lib/middleware/csrf.ts`, `lib/authz/allow.ts`, `lib/security/*` are imported by few or no live routes.
- Imperative schema with dozens of `ensureColumn` ALTERs and inline prompt seeding inside `client.ts` (730 lines).

**Recommendations:** pick one UI tree and delete the other; collapse to one RBAC module used everywhere; extract `dev-server.js` or delete it; move schema to a migrations folder; delete dead security modules or wire them in.

---

## 4. Separation of Concerns

- Routes contain domain logic, DB access, QBO calls, and authz inline (`transition/route.ts` is the clearest example: ~300 lines mixing RBAC, state, QBO, audit). The clean `lib/workflow/engine.ts::transition()` (which centralizes RBAC) is bypassed by that route. **Good abstractions exist but are not used.**
- Data access is split between `lib/invoices/db-store.ts`, raw `db.prepare` in routes, and JSON file stores — no single repository layer.

---

## 5. Modularity & 6. Coupling

- `lib/qbo`, `lib/invoices`, `lib/gpt` have reasonable internal cohesion.
- **High coupling to one customer:** hard-coded admin emails (`currentUser.ts`, `rolesStore.ts`, `localUserService.ts`), hard-coded clinics and ship-to references (`client.ts`), hard-coded QBO account IDs (`dev-server.js` `1150040000`, vendor `33`), hard-coded approval destination (`mckaym@pcsmiles.com`), hard-coded Mac Mini Tailscale IP. None of this is configuration-driven, so a second organization cannot be onboarded without code changes.

---

## 7. Cohesion

- Domain modules are cohesive; the legacy Express server and the `src/` SPA are not. The mixing of Python parsers, TS GPT parsers, and JSON knowledge bases across three locations reduces conceptual cohesion of the parsing subsystem.

---

## 8. Future Growth Limitations (blocking multi-org scale)

1. **No tenancy primitive.** Adding `organization_id` touches every table, query, route, and the QBO token model. This is the single largest architectural debt.
2. **Auth model cannot be hardened incrementally** — it must be replaced (signed sessions / real IdP) before any external exposure.
3. **SQLite + single process** caps throughput and blocks zero-downtime deploys and horizontal scale.
4. **Per-tenant QBO connections, chart-of-accounts, classes, and vendor maps** are all assumed singular.
5. **Config-as-code** (emails, accounts, clinics) prevents self-serve onboarding.

---

## 9. Architectural Risks (ranked)

| # | Risk | Impact | Likelihood |
|---|---|---|---|
| A1 | No multi-tenant isolation; one DB/realm for all | Cross-org data exposure at scale | High |
| A2 | Forgeable identity (unsigned cookie) | Full compromise | High |
| A3 | Secrets + QBO tokens committed to git | Account takeover | High (already exposed) |
| A4 | Single SQLite/process/disk | Data loss, no HA, no scale | Medium-High |
| A5 | No idempotency on bill/payment | Duplicate financial records | Medium |
| A6 | Two backends, three RBAC models | Inconsistent enforcement, drift | Medium |
| A7 | Lazy, failure-swallowing migrations | Silent corruption | Medium |

See `TOP_PRIORITY_ACTIONS.md` for sequencing. The honest summary: the codebase is a capable single-company AP automation MVP, but reaching "millions of dollars across many organizations" requires re-platforming tenancy, auth, and persistence — not incremental patches.
