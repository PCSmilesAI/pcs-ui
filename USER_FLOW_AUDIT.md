# USER_FLOW_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Personas analyzed against the actual pages (`app/*Page/`, `src/ui-pages/`) and the role matrix (`lib/auth/permissions.ts`, `roles.json`).
> Note: because production routing uses `test_mode_route_all_to_admin: true`, in practice **almost everything funnels to the admin (McKay)**. Several persona flows below are therefore latent (coded but inactive).

## Pages → personas

| Page | Primary persona | Purpose |
|---|---|---|
| `IncomingQueuePage` | AP staff | Triage newly parsed invoices |
| `ForMePage` | Office/Admin approver | Invoices awaiting *my* approval |
| `ToBePaidPage` | AP/Admin | Approved, awaiting payment (QBO Bill-Pay) |
| `CompletePage` | All | Paid/closed |
| `AllInvoicesPage` | Admin/AP | Global list |
| `InvoiceDetailPage` | All | View/edit/code one invoice |
| `VendorsPage`/`VendorDetailPage` | Admin/AP | Vendor + ACH/Stripe mgmt |
| `RolesPage` | Admin | Manage admins/AP/office managers |
| `QboExportPage`/`ConnectionsPage` | Admin | QBO connect/export |
| `CreditCardReceiptsPage` | Office (McKay) | Receipt capture/matching |
| `ReportsPage` | Admin/Regional | KPIs |
| `OtherDocumentsPage` | AP | Non-invoice docs |

---

## AP staff
- **Flow:** Incoming → open detail → fix vendor/amount/office/category → send for approval.
- **Dead ends:** If parsing produced "Unknown" vendor or no office, there's no guided remediation — the invoice can be pushed forward and fails at QBO bill creation downstream with an error the AP user never sees (failure is logged, approval still "succeeds"). (B2)
- **Missing validation:** No client/server gate on amount>0, vendor resolvable, office valid before "send for approval."
- **Confusing UX:** `incoming`, `categorized`, and `coded` all display as "Ready for Review" (`formatStatusForDisplay`), so AP can't tell what stage an item is actually in (B24).
- **Data integrity risk:** Free-text edits to vendor/office aren't constrained to the QBO vendor/class lists in the UI, so a typo creates a new QBO vendor on bill creation.

## Office managers
- **Intended flow:** ForMe → approve invoices for their office under the threshold.
- **Currently inactive:** test-mode routes everything to admin, so office managers rarely receive items; the threshold ($1000) never applies. The tier exists but is bypassed.
- **Permission contradiction:** `canViewAllInvoices: true` for office managers with no query scoping → an office manager can view invoices for *other* offices (B14). Confusing and a data-segregation concern.
- **Dead end:** office_managers map seeds empty strings (`Milwaukie: ['']`), so most offices have no real manager; assigning one requires editing `roles.json` via RolesPage (admin only).

## Regional managers
- **No first-class role.** There is no `regional_manager` in any RBAC model. "Regional" oversight is only achievable as admin or via Reports. Multi-clinic rollups exist in `ReportsPage` but there's no scoped regional view.

## Administrators
- **Flow:** Approve anything (single step → to_be_paid → QBO bill), manage roles, connect QBO, run exports, mark paid.
- **Power concentration:** one admin can code, approve, and mark paid (no SoD) — efficient but uncontrolled (FINANCIAL_CONTROLS §1).
- **Confusing/duplicated controls:** Both a Next.js app and the legacy `dev-server.js` expose overlapping admin actions; the AI-Mechanic admin page can self-modify the system — a high-risk control with little guardrail.
- **Workflow inefficiency:** RolesPage edits a JSON file; changes are picked up by re-reading the file each request (`readRoles` always reads fresh) — OK, but there's no validation that an assigned office name matches a real clinic (B8).

## Practice operators (clinic front-desk)
- Not a distinct role; they appear only as `office_managers` entries. No clinic-scoped operator experience.

## Accounting users
- **Flow:** ToBePaid → click pay → redirected to QBO Bill-Pay; reconcile in QBO; status synced via cron/mark_paid.
- **Dead end:** if an invoice reached `to_be_paid` without a QBO bill (B2), the pay action returns "No QuickBooks bill found... approve the invoice first" — but it *was* approved, so the user is stuck with no in-app recovery except admin retry-bills.
- **Reconciliation gap:** manual QBO edits/payments don't flow back (webhook no-op), so the in-app "Complete" view can disagree with QBO truth (operator confusion, double-pay risk).
- **Batch payment UX:** pay tags bills with a 3-char batch code in DocNumber for QBO search — clever, but truncation can corrupt the reference (B11), so the QBO search may miss bills.

---

## Cross-cutting UX / integrity issues
1. **Status taxonomy leaks/collapses** — internal states don't map cleanly to user-facing labels; "Sent for Approval" vs "Awaiting Office Approval" vs "Ready for Review" are easy to confuse.
2. **No optimistic-lock feedback** — two users editing the same invoice silently overwrite (B5); the UI gives no conflict warning.
3. **Errors hidden** — many server failures are logged server-side and return generic messages; users can't tell why an action didn't take effect (good for security, bad for operability — needs a user-facing remediation channel).
4. **No audit visibility for operators** — `invoice_events` isn't surfaced as a per-invoice history timeline, so approvers can't see who did what.
5. **Two front-ends** (`src/ui-pages/*.jsx` legacy + `app/*Page`) risk divergent behavior depending on which is served.
6. **Free-text fields feeding accounting** — vendor/office/category edits should be constrained dropdowns bound to QBO lists to prevent downstream miscoding/duplicate vendors.

## Recommendations
- Add a **pre-submit validation panel** (amount, vendor∈QBO, office∈clinics, dates) with inline fixes.
- Constrain vendor/office/category to **QBO-backed selectors**.
- Distinct, accurate **status labels**; per-invoice **event timeline** UI.
- **Conflict detection** on concurrent edits (surface `status_version` mismatch).
- A clear **recovery flow** for "approved but no bill" invoices.
- Introduce a real **regional/operator** role with clinic scoping once tenancy/auth is fixed.
- Retire the legacy front-end and any UI affordances pointing at empty Stripe routes.
