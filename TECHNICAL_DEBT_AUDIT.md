# TECHNICAL_DEBT_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Inventory of dead code, duplication, obsolete logic, complexity hotspots, and refactor opportunities.

## 1. Dead / unused code

| Item | Evidence | Action |
|---|---|---|
| `lib/session/*` (SQLite sessions) | Not called by login or any route | Wire in (preferred) or delete |
| `lib/authz/allow.ts` permission matrix | Not used by live transition/pay routes | Adopt everywhere or delete |
| `lib/middleware/csrf.ts`, `withCSRF.ts`, `cookieHardening.ts` | Referenced by 2 routes only | Apply globally or delete |
| `lib/workflow/engine.ts::transition()` | Bypassed by `transition/route.ts` | Make it the single entry point |
| `fetchQueue.ts` (root, 0 bytes) + `src/lib/fetchQueue.ts` | Empty | Delete |
| `app/api/stripe/{connect,webhook,status,ping,payment-history}` | Empty dirs, no `route.ts` | Delete or implement |
| `src/ui-pages/VendorDetailPage copy.jsx` | Copy artifact | Delete |
| `ecosystem.config.js.backup`, `production.config.js` | Stale configs | Consolidate |
| `4) \`requirements.txt`, `5. \`requirements.txt` | Malformed accidental files | Delete |
| `lib/qbo/memoryStorage.ts` | Likely superseded by `tokenStorage` | Verify + remove |
| `dev-server.js` (3,804 lines) | Legacy Express backend, not the prod process | Retire after extracting anything still used |

## 2. Duplicate code / parallel implementations

- **Two front-ends:** legacy Vite SPA (`src/ui-pages/*.jsx`, `src/context/*`, `src/components/*.jsx`) and Next App Router (`app/*Page/page.tsx`, `components/*`). Many pages exist in both.
- **Two backends:** `app/api/**` (Next) and `dev-server.js` (Express) implement overlapping QBO OAuth, webhooks, invoice status updates, and bill creation with different rules.
- **Two QBO clients:** `lib/qbo/qboClient.ts` + `oauthClient.ts` (Next) vs `QBOAuthClient` in `dev-server.js` vs `src/qbo/qbo_client.py` + `src/utils/quickbooksApi.js` + `src/utils/qbOAuthClient.js`.
- **Three RBAC models** (`permissions.ts`, `allow.ts`, `currentUser.ts`) — see BUG_CATALOG B13.
- **Two token stores** (`tokenStorage.ts` SQLite/JSON + encrypted `database.js` legacy manager).
- **Multiple categorizers:** `lib/categorize.ts`, `src/lib/categorize.ts`, `historicalCategorizer.ts`, `invoice_categorizer.py`, `lib/gpt/documentClassifier.ts`.
- **Multiple data stores for the same concept:** invoices live in SQLite `invoices`, `invoice_queue.json` (+5 backups), and `output_jsons/*` — a half-finished JSON→SQLite migration.

## 3. Obsolete / legacy logic

- **JSON-file persistence** (roles, queue, vendor payments, office info) predates SQLite and is partially superseded; `lib/db/migrate-from-json.ts` and `scripts/restore-invoices-from-queue.js` indicate an incomplete migration.
- **Gist-based user store** (public) — obsolete auth mechanism that should be fully removed (SECURITY C3/C4).
- **Per-vendor Python parsers** increasingly replaced by the GPT path but all still shipped (~25 files).
- **Hard-coded QBO account IDs** (`1150040000`, `33`) in `dev-server.js`.

## 4. Unused services / APIs

- Empty Stripe routes (above).
- `app/api/test`, `api/hello`, `api/hello-world`, `api/test-simple` (in dev-server) and various `scripts/test-*.js` are scaffolding, not a real test suite (`npm test` = `exit 1`).
- `app/api/build-info`, `/api/health`, `/metrics` duplicated across Next and dev-server.
- AI-Mechanic endpoints (`/api/ai-mechanic/*`) — powerful self-modification surface of unclear ongoing use.

## 5. Complexity hotspots

| File | Size | Concern |
|---|---|---|
| `dev-server.js` | 3,804 lines | Monolith: OAuth+webhooks+DB+middleware+routes |
| `lib/db/client.ts` | 730 lines | Schema + dozens of ALTERs + inline prompt seeding |
| `lib/qbo/billCreationService.ts` | 903 lines | Classification + GL splitting + path resolution + bill build |
| `email_ingestion_agent_enhanced.py` | 57 KB | Intake + split + route + parse |
| `epic_parser.py` | 60 KB | One-vendor parser |
| `app/api/invoices/gpt-ingest/route.ts` | ~500+ lines | Ingest + dedup + multi-invoice |
| `app/api/invoices/transition/route.ts` | 300 lines | RBAC + state + QBO + audit inline |

## 6. Testing / CI debt

- `npm test` → `echo "Error: no test specified" && exit 1`. No automated unit/integration tests run; `scripts/test-*.js` are manual scripts.
- No parser regression harness despite 260 labeled `output_jsons/` samples.
- No type-check/lint gate enforced in CI (lint script exists; `tsconfig.tsbuildinfo` committed).

## 7. Repo hygiene

- 5.1 GB working tree; committed large binaries/logs/PDFs (`log.txt`, `queue_writer.log`, `pcs_qbo_transactions.xlsx`, `email_invoices/`, `output_jsons/`, `pcs-ui dec3 copy/` full backup folder).
- Secrets/tokens committed (`.env`, `production.env`, `qbo_tokens.db`) — see SECURITY.
- `node_modules` committed inside `pcs-email-proxy/`.

## 8. Refactor roadmap (sequenced)

1. **Consolidate auth/RBAC** into one module backed by real sessions; delete the other two and the gist.
2. **One backend:** retire `dev-server.js`; one QBO client; one token store (encrypted).
3. **One frontend:** keep App Router, delete `src/` SPA duplicates.
4. **Repository layer** for invoices (kill direct `db.prepare` in routes and JSON stores); finish JSON→SQLite→(Postgres) migration.
5. **Extract schema** to versioned migrations; remove inline prompt seeding from `client.ts`.
6. **Split hotspots** (`billCreationService`, `transition route`) into cohesive services.
7. **Stand up CI:** type-check, lint, unit tests, and a parser regression suite; make `npm test` real.
8. **Repo cleanup:** purge secrets from history, move binaries/PDFs to storage, delete backup folders and dead files.
