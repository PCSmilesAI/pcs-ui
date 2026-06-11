# TOP_PRIORITY_ACTIONS.md — PCS AI

> Audit date: 2026-06-11. Ranked, brutally honest remediation plan. Prioritization weights (per brief): 1) financial risk, 2) security, 3) multi-tenant, 4) data integrity, 5) customer impact, 6) scalability, 7) maintainability.
> Cross-references: `SECURITY_AUDIT.md` (Cx/Hx), `BUG_CATALOG.md` (Bx), `FINANCIAL_CONTROLS_AUDIT.md`, `QUICKBOOKS_INTEGRATION_AUDIT.md`, `MULTI_TENANT_AUDIT.md`.

## Brutal-honesty summary
PCS AI is a working **single-company AP automation MVP** with genuinely useful parsing/QBO automation. Measured against "a production platform managing millions of dollars across many dental organizations," it is **not there and not close**. Three facts gate everything else:
1. **Anyone can become admin** by setting a cookie — every approval/payment control is therefore decorative.
2. **Production QBO secrets, OAuth tokens, and user credentials are publicly/`git`-exposed** — assume they're already compromised.
3. **There is no tenancy** — a second organization cannot be onboarded without commingling data.
Do not expand usage or onboard a second org until CRITICAL items below are done.

---

## CRITICAL — do immediately (this week). Production-blocking.

| # | Action | Why | Refs |
|---|---|---|---|
| 1 | **Rotate everything exposed**: QBO client secret + all OAuth tokens (at Intuit), `QBO_STATE_SECRET`, `CRON_SECRET`, GitHub token, all user passwords. Then `git rm --cached` `.env*`, `production.env`, `qbo_tokens.db`; purge git history (filter-repo/BFG); move secrets to a manager. | Live financial credentials are in the repo. | SEC C2, QBO §1 |
| 2 | **Kill the public Gist auth path.** Delete the gist, remove `/api/gist-users` + `/api/update-gist` + the login/signup gist fallbacks. SQLite `users` is already source of truth. | User credentials (incl. plaintext) are publicly readable; `/update-gist` lets anyone overwrite all users unauthenticated. | SEC C3, C4 |
| 3 | **Replace cookie identity with real server sessions.** Wire `lib/session/*` into login (httpOnly, Secure, signed session id); make `getCurrentUser` look up the session server-side; delete the `?email=` fallback. | Forgeable identity defeats all authz. | SEC C1, B4 |
| 4 | **Route every transition through `engine.transition()`** (enforces `ensureRole`) using the validated session identity; remove the direct `approveAP/Office/Admin` calls in the route. | Approval/RBAC bypass; anyone can approve/bill. | SEC C5, FIN §2 |
| 5 | **Make QBO bill creation idempotent + transactional + fail-closed.** Single DB tx: lock row → re-check `qbo_bill_id` → query QBO by DocNumber → create → persist. If creation fails, do **not** advance to `to_be_paid`. | Concurrent approvals duplicate payables; failed bills become "payable" with no bill. | FIN §3, B1, B2, QBO §4 |
| 6 | **Do not run `dev-server.js` in production**; if it's running, stop it. It exposes unauthenticated invoice mutation, file deletion, token-returning OAuth, and an unverified webhook. | Direct unauthenticated financial/token access. | SEC C7 |

---

## HIGH — within 2–4 weeks. Required before any external exposure or volume increase.

| # | Action | Refs |
|---|---|---|
| 7 | **Authenticate + authorize every data route** (and the PDF route). `GET /api/invoices/[id]`, `/visible`, `/qbo/*`, `/vendors/*`, `/pdf/[filename]`, `db/init`, `db/normalize-vendors` currently need none. | SEC H1, H2, H6 |
| 8 | **Add CSRF protection** (double-submit) to all mutating routes, or move to bearer auth. | SEC H3 |
| 9 | **Encrypt QBO tokens at rest** (KMS key); stop the plaintext JSON mirror; single-flight token refresh (mutex). | SEC H4, B7 |
| 10 | **Real QBO webhook**: require verifier, timing-safe HMAC, persist+dedupe events, and sync bill/payment/delete changes back into PCS AI. | SEC H5, QBO §3/§6 |
| 11 | **Disable `test_mode_route_all_to_admin` in production**; enforce SoD (maker≠checker) and a second approver above a real threshold; separate "approver" from "mark paid." | FIN §1, §2 |
| 12 | **Remove client-trusted financial inputs**: `mark_paid` must reconcile `total`/payment id against QBO; stop auto-balancing silently — flag mismatches for review; never bill to COGS/arbitrary fallback accounts. | FIN §4, B9, B10, QBO §8 |
| 13 | **Remove self-service admin code** (`PCSADMIN2024`/`PCSAP2024`); provision roles via authenticated admin only. | SEC C6 |
| 14 | **Fix migrations to fail loudly**; add `status_version` compare-and-swap on invoice updates. | B12, B5 |

---

## MEDIUM — 1–3 months. Correctness, integrity, and the multi-tenant foundation.

| # | Action | Refs |
|---|---|---|
| 15 | **Introduce tenancy**: add `organization_id` to every table, backfill PCS, scope all queries via a repository layer, per-tenant QBO tokens/roles/maps. Prerequisite for any second org. | MULTI-TENANT (whole doc) |
| 16 | **Reconcile invoice dedup vs schema**: `UNIQUE(invoice_number, vendor_name[, org])`; align ingest logic. | B3, PIPELINE §5 |
| 17 | **Money in integer cents end-to-end**; deterministic remainder distribution across split lines. | B16 |
| 18 | **Reconcile clinics ↔ roles ↔ QBO classes** into one canonical location list. | B8, PIPELINE §4 |
| 19 | **Pre-approval validation gate** (amount>0, vendor∈QBO, office∈clinics, sane dates, confidence≥threshold → else `repair`). | PIPELINE §3 |
| 20 | **Tamper-evident audit trail**: server-validated actor on every event, append-only/external log, ensure all mutations emit events; surface a per-invoice history UI. | FIN §6, USER_FLOW |
| 21 | **Consolidate duplicates**: one backend (retire dev-server), one frontend (drop `src/` SPA), one RBAC module, one QBO client, one token store. | TECH_DEBT §2/§8 |
| 22 | **Stand up CI**: type-check, lint, unit tests, and a parser regression suite over `output_jsons/`; make `npm test` real. | TECH_DEBT §6 |

---

## LOW — opportunistic / hygiene.

| # | Action | Refs |
|---|---|---|
| 23 | Repo cleanup: purge committed binaries/logs/PDFs/backup folders; move PDFs to object storage. | TECH_DEBT §7 |
| 24 | Add API security headers via a shared wrapper (middleware excludes `/api`). | SEC L1, B23 |
| 25 | Fix status labels / collapsed states in UI; constrain vendor/office/category to QBO-backed selectors. | USER_FLOW, B24 |
| 26 | Delete dead files (`fetchQueue.ts`, `*copy*`, malformed `requirements.txt`, empty Stripe routes, `memoryStorage.ts`). | TECH_DEBT §1, B17/B19 |
| 27 | Scrub tokens/PII from logs; reduce verbose logging. | SEC M3 |

---

## Scalability / re-platform (parallel track, 3–6 months)
SQLite-single-file + single-process caps throughput, blocks HA and zero-downtime deploys, and cannot enforce row-level tenancy. Plan migration to **Postgres** (tenancy, concurrency, PITR backups), **object storage** for documents, **shared cache (Redis)** for rate-limit/circuit-breaker state, and **stateless app instances** behind a load balancer. This is required to credibly handle "millions of dollars across many organizations."

---

## One-paragraph verdict for leadership
The product's core automation (email→parse→QBO bill) is valuable and largely works for one company. But its security and financial-control posture is **unacceptable for production money movement today**: identity is forgeable, live QBO and user credentials are exposed, approvals can be bypassed, and bills can duplicate or post incorrectly. There is also no multi-tenancy, so the "many dental organizations" goal is a build, not a config. Freeze expansion, execute the six CRITICAL actions immediately (they are days of work, not months), then the HIGH set before any external exposure, and treat tenancy + re-platform as the funded path to the stated vision.
