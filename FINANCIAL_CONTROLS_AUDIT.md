# FINANCIAL_CONTROLS_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Evaluated as if PCS AI were undergoing a financial controls (SOX-style / PE operational) review of its AP automation.
> **Overall control rating: Inadequate.** Segregation of duties is configuration-defeatable and code-bypassed, approvals run on forgeable identity, there is no idempotency on bill creation, and the audit trail is non-repudiable in name only. For a system intended to move millions of dollars, these are material weaknesses.

How money actually moves: PCS AI does **not** execute payments. On approval it creates a **Bill** in QuickBooks Online; `/api/invoices/pay` returns QBO **Bill-Pay redirect URLs** and tags the bill's DocNumber with a batch code; a human pays inside QBO; `mark_paid` / a cron then reconciles status. So the financial controls that matter are: who can approve, whether bills are created correctly and exactly once, and whether the paid/approved records are trustworthy.

---

## 1. Segregation of Duties (SoD)

**Findings**
- **`test_mode_route_all_to_admin: true`** (default in `roles.json` and `DEFAULT_ROLES`, `lib/workflow/rolesStore.ts`) forces every invoice — any amount — to `awaiting_admin_approval`, collapsing AP→office→admin into **a single admin approval**. The dollar `threshold_usd` ($1000) is inert. One person both codes and approves.
- **Admin approval is single-step and final**: `transition/route.ts` `approve` → `approveAdmin` → `to_be_paid` + QBO bill in one action by one user. No second approver, no maker/checker on high-value items.
- **The same admin can `mark_paid`.** Coding, approving, and recording payment can all be one identity.

**Why it matters:** No enforced separation between the person who enters/codes an invoice and the person who approves payment — the foundational AP control.

**Fix:** Enforce maker≠checker; require a second approver above a real threshold; disable test-mode routing in production; make `mark_paid` a distinct role from approver.

---

## 2. Approval Bypass Opportunities

- **Engine RBAC is bypassed.** `app/api/invoices/transition/route.ts` calls `approveAP/approveOffice/approveAdmin` directly instead of `engine.transition()`, skipping `ensureRole()`. A non-AP, non-office user can advance invoices through AP/office stages. (SECURITY_AUDIT C5)
- **Forgeable admin identity** (SECURITY_AUDIT C1): a forged `pcs_user` cookie yields `isAdmin=true`, enabling direct admin approval and bill creation.
- **QBO bill creation failure does not block approval.** On `to_be_paid` the bill is attempted; on failure the invoice still advances (logged only). Result: an "approved/to_be_paid" invoice with no QBO bill, which `mark_paid` can still mark paid.

**Fix:** All transitions through the RBAC-enforcing engine using server-validated identity; fail-closed if bill creation fails; block `mark_paid` without a verified QBO bill+payment.

---

## 3. Duplicate Payment / Duplicate Bill Risks

- **No idempotency on QBO bill creation.** `createBillFromInvoice` never queries QBO for an existing bill with the same DocNumber; the only guard is `if (invoice.status === 'to_be_paid' && !invoice.qbo_bill_id)` in the route. With no DB transaction/lock, **two concurrent approve requests both read `qbo_bill_id = null` and each create a bill** → duplicate payable bills for one invoice. (`app/api/invoices/transition/route.ts`, `lib/qbo/billCreationService.ts`)
- **DocNumber truncation collisions.** Invoice numbers are sliced to 21 chars for QBO `DocNumber`; `/api/invoices/pay` further prepends a 3-char batch code then re-slices to 21. Two long invoice numbers sharing a 21-char prefix become indistinguishable in QBO, defeating QBO's own duplicate-DocNumber warning.
- **Schema vs. logic dedup conflict.** `invoices.invoice_number` is **globally UNIQUE**, but ingest logic dedups on `invoice_number`+`vendor` (`app/api/invoices/gpt-ingest/route.ts`). Two vendors with the same invoice number → either a UNIQUE-constraint failure (lost invoice) or a suffix hack — inconsistent and corruption-prone.
- **Retry path** (`/api/invoices/retry-bills`) can re-create bills for invoices whose first attempt actually succeeded if `qbo_bill_id` wasn't persisted.

**Fix:** Idempotency key per invoice; wrap "check qbo_bill_id → create → persist" in a single DB transaction with row lock; query QBO by DocNumber before create; make `invoice_number` unique **per vendor** (and per tenant).

---

## 4. Invoice Manipulation Risks

- **Amounts/vendor/office are mutable via unauthenticated or weakly-authenticated routes.** Edit/categorize routes rely on the forgeable cookie; `GET` is fully open. A changed `amount_cents`/`vendor_name` flows directly into the QBO bill total and the balancing line.
- **`mark_paid` trusts client-supplied `total` and `stripePaymentId`** (no reconciliation against QBO/Stripe) — a paid record can be fabricated.
- **Balancing line auto-insertion** (`ensureAccountLines`) silently adds "Other charges (shipping/tax/fees)" or "Adjustment to match total" to force line sum = invoice total. This can mask parsing errors and post incorrect amounts to expense accounts without review.

**Fix:** Authenticated, authorized, field-locked edits with full before/after audit; reconcile paid status against QBO BillPayment; flag (don't silently auto-balance) line/total mismatches for human review.

---

## 5. Reconciliation Weaknesses

- Reconciliation is a cron (`scripts/cron-verify-payments.js` / `/api/invoices/verify-qbo-payments`) protected by a weak default `CRON_SECRET` (`pcs-cron-verify-2024`). If reachable with the default secret, payment status can be toggled.
- No three-way match (PO/receipt/invoice) — there are no POs in the model. For dental supplies this is partly acceptable, but there's also no goods-receipt confirmation.
- Manual QBO edits/payments are not authoritatively synced back (webhook is a no-op, SECURITY_AUDIT H5), so PCS AI's `paid`/`to_be_paid` state can drift from QBO truth.

**Fix:** Strong cron auth; authoritative QBO webhook sync; periodic full reconciliation report with exception handling.

---

## 6. Missing / Weak Audit Trail & Approval Records

- `invoice_events` + per-stage timestamp/user columns exist (good intent), **but `actor_email` is the forgeable identity** — attribution is spoofable, so records are not non-repudiable.
- Audit lives in the same SQLite DB an admin can modify; no append-only/WORM, no external immutable log.
- Several mutations (e.g., direct `db.prepare(UPDATE ...)` in routes, JSON file edits) do not write an event at all → gaps.
- Reject-for-coding clears approval fields and `qbo_bill_id` and deletes the QBO bill; the deletion is logged to console, not always to `invoice_events`.

**Fix:** Server-validated actor on every event; append-only audit store (or stream to external SIEM/ledger); ensure every state/financial mutation emits an event; capture before/after values.

---

## 7. State-Transition Failures (financial integrity)

- The canonical `stateMachine.ts` transition table is **not used** by the live transition route, so illegal transitions the table would forbid can occur (the route hand-rolls allowed moves).
- `paid` is treated as near-terminal (only `rejected` allowed), but `mark_paid` can run on an invoice with no QBO bill, and reject-after-paid cannot delete a paid QBO bill — leaving PCS AI and QBO inconsistent.
- No optimistic-concurrency enforcement despite a `status_version` column — it is written but not checked on update, so lost updates are possible under concurrency.

**Fix:** Drive all transitions through the state machine; enforce `status_version` with compare-and-swap; reconcile paid invoices to QBO before allowing reversal.

---

## 8. Controls Scorecard

| Control | Status |
|---|---|
| Segregation of duties | ✗ Defeated by test-mode + single-admin path |
| Maker/checker on high value | ✗ None |
| Approval authorization enforced server-side | ✗ Forgeable + engine bypassed |
| Idempotent bill creation | ✗ Race → duplicates |
| Duplicate-invoice prevention | ⚠ Conflicting schema vs logic |
| Payment reconciliation | ⚠ Cron with weak secret; webhook no-op |
| Immutable audit trail | ✗ Spoofable actor, mutable store |
| Amount integrity | ⚠ Auto-balancing hides errors; client-supplied paid totals |
| Concurrency safety | ✗ `status_version` unchecked |

**Bottom line for a controls reviewer:** multiple **material weaknesses**. Before PCS AI can be trusted with significant payment volume, it needs enforced SoD, server-validated identity on approvals, transactional idempotent bill creation, authoritative QBO reconciliation, and a tamper-evident audit trail. See `TOP_PRIORITY_ACTIONS.md`.
