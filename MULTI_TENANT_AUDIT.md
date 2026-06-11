# MULTI_TENANT_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Premise from the brief: "a single mistake could expose one dental group's financial data to another."
> **Core finding: PCS AI is not multi-tenant. There is no tenant boundary to mistake — there is none at all.** The application is single-tenant, hard-wired to one organization (Pacific Crest Smiles) and one QuickBooks company. Onboarding a second dental *organization* today would commingle its data with PCS's in the same tables and the same QBO realm.

---

## 1. Is there a tenant model? No.

- **No `organization_id` / `tenant_id` column** exists on any table (`lib/db/client.ts` schema reviewed in full). The only scoping dimensions are `office_id` / `clinic_id` / `office_location`, which represent **clinic locations of one company**, modeled as QBO Classes (`General-<Office>`) and Departments.
- **One roles file** (`roles.json`) holds a single global `admins`, `ap_authorizers`, and `office_managers` map. There is no per-tenant roles structure.
- **One QBO connection.** `lib/qbo/tokenStorage.ts::getLatestTokens()` returns the most recently updated token irrespective of realm, and bill creation/payment use that single realm. The data model assumes exactly one accounting company.
- **One user table** with no tenant association; any user is global.

Conclusion: "multi-practice" in this codebase = multi-location, not multi-customer. The MULTI-TENANT requirements in the brief are unimplemented.

---

## 2. Cross-Practice Data Exposure (within the one company, and hypothetically across orgs)

- **Every invoice query is unscoped.** `getVisibleInvoices`, `getInvoiceById`, `/api/invoices/[id]`, `/api/invoices/visible`, the `pay` route, etc. select from `invoices` with filters only on `status`/`deleted` — never on tenant. (`lib/invoices/db-store.ts`, `app/api/invoices/[id]/route.ts`)
- **Unauthenticated reads.** `GET /api/invoices/[id]` and `/api/pdf/[filename]` require no auth (SECURITY_AUDIT H1/H2). Any caller can enumerate invoices by `invoice_number` and pull PDFs. If a second org's data were added, it would be readable by the first org's users (and anonymous callers) immediately.
- **Office managers can see beyond their office.** `lib/auth/permissions.ts` grants office managers `canViewAllInvoices: true` (comment claims "only their own" but the flag is `true`), and there is **no query-level enforcement** that restricts an office manager's invoice list to their offices. The restriction, where it exists, is UI-side only.

---

## 3. Cross-Practice Permission Leakage

- **Three disjoint RBAC models** (`lib/auth/permissions.ts`, `lib/authz/allow.ts`, `currentUser.ts` `ADMIN_EMAILS`) — none tenant-aware. A role grant is global; there is no concept of "admin of org A but not org B."
- **`vendor_access`** in `roles.json` (`*` | array | `assigned_only`) is the closest thing to scoping, but it is per-user vendor filtering, not tenant isolation, and is enforced inconsistently (only some list endpoints honor it).
- **Forgeable identity** (SECURITY_AUDIT C1) means even the existing office/admin distinctions are not enforceable server-side.

---

## 4. Query Isolation Failures

| Endpoint | Tenant filter? | Notes |
|---|---|---|
| `GET /api/invoices/[id]` | none | also unauthenticated |
| `GET /api/invoices/visible` | none | status-only |
| `POST /api/invoices/transition` | none | mutates any invoice by id |
| `POST /api/invoices/pay` | none | any `invoiceIds` |
| `GET /api/vendors/*` | none | global vendor list |
| `GET /api/qbo/*` | single realm | one company's QBO |
| `users` / `roles.json` | none | global |

Every data path would need a `WHERE organization_id = ?` (or equivalent) that does not exist.

---

## 5. RBAC Inconsistencies (tenant-relevant)

- Role string mismatch (`ap` vs `ap_manager`) between modules means a future tenant-scoping layer bolted onto one module would not cover the others.
- The live approval route bypasses the one module (`engine.ts`) that centralizes role checks (SECURITY_AUDIT C5), so any tenant scoping added there would be skipped in production.

---

## 6. Data Segregation Weaknesses

- Single SQLite file; no schema-per-tenant, no row-level security (SQLite has none natively), no encryption boundary between tenants.
- Shared filesystem for PDFs (`email_invoices/`) with predictable names — no per-tenant directory or access control.
- Shared JSON stores (`vendor_payments.json`, `vendor_stripe_map.json`) keyed by vendor name globally; two orgs using the same vendor (e.g., "Henry Schein") would collide on mapping and payment metadata.
- Shared QBO chart-of-accounts/classes assumptions and hard-coded account IDs.

---

## 7. What "multi-tenant" would require (gap list)

1. `organization_id` on every table; backfill existing rows to the PCS org.
2. Tenant resolved from the authenticated session (after auth is fixed) and injected into **every** query (repository layer, not ad-hoc).
3. Per-tenant QBO OAuth tokens, realm, chart-of-accounts, classes, vendor maps, and roles.
4. Per-tenant file storage (object storage with tenant-prefixed keys + signed URLs).
5. Tenant-aware RBAC in a single module used by all routes.
6. Postgres with row-level security (or strictly enforced query scoping) — SQLite cannot provide this safely at scale.
7. Tenant-scoped rate limiting, audit logs, and backups.

---

## 8. Risk Statement

Today the blast radius is "one company." The moment a second organization is added without the above, **any authenticated (or, for several endpoints, unauthenticated) user of either org can read and mutate the other's invoices, vendors, and QBO bills.** Given the forgeable-auth and unauthenticated-read findings, the practical exposure is total. Multi-tenant isolation is not a hardening task here — it is a foundational build that does not yet exist. This must precede any onboarding of a second dental organization.
