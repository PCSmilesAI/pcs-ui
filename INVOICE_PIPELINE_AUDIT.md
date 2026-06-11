# INVOICE_PIPELINE_AUDIT.md — PCS AI

> Audit date: 2026-06-11. Scope: the full invoice lifecycle — upload, OCR, parsing, validation, routing, approval, accounting export, QBO sync.

## Pipeline overview

```
IMAP mailbox
  └─ email_ingestion_agent_enhanced.py  (poll, save attachments → email_invoices/)
       └─ multi_invoice_detector.py / multipage_invoice_processor.py  (split multi-invoice PDFs)
            └─ vendor_detector.py / enhanced_vendor_router.py  (choose parser)
                 ├─ per-vendor Python parser (patterson/henry/darby/epic/…)
                 └─ GPT path: lib/gpt/parseInvoice.ts + pdfToImages.ts + Master Parsing Prompt + vendor KB
                      └─ POST /api/invoices/gpt-ingest (or /api/invoices/ingest)
                           └─ invoices row (status=incoming)  +  tombstone/dedup checks
                                └─ categorize / coding template (single vs multi-location)
                                     └─ POST /api/invoices/transition (approve)
                                          └─ createBillFromInvoice → QBO Bill (+ PDF attach)
                                               └─ /api/invoices/pay → QBO Bill-Pay URL
                                                    └─ mark_paid / verify-qbo-payments cron → paid
```

---

## Stage-by-stage findings

### 1. Upload / Ingestion (email)
- **Failure point:** IMAP polling is a single Python process (`pm2-inbox-watcher`); if it dies, intake silently stops. No dead-letter, no alerting on parse/save failure.
- **Data loss risk:** attachments saved to local disk (`email_invoices/`) with no object-storage backup; disk loss = lost source documents. Filenames are derived from email subjects (collisions possible; many near-identical `Scanned_from_a_Lexmark...` names).
- **Multi-invoice PDFs:** `multi_invoice_detector` splits one PDF into N invoices (`document_group_id`, `pdf_page_start/end`). If detection misfires, multiple invoices collapse into one (underpayment) or one invoice explodes into many (duplicate bills).

### 2. OCR / Parsing
- **OCR weaknesses:** mixed OCR + GPT-vision (`pdfToImages.ts`). Scanned faxes (`Scanned_from_a_Lexmark...`) are low quality; no confidence gate blocks low-quality extractions from proceeding (`parsing_confidence` is stored but not enforced as a hard stop).
- **Parsing weaknesses:** ~25 bespoke Python parsers, each with regex specific to one vendor template — brittle to format changes. The GPT generalist is the fallback but quality varies. No automated regression suite over the 260 `output_jsons/` samples is wired into CI.
- **Amount parsing:** `sanitizeAmount` strips non-numeric chars; locale/format edge cases (e.g., `1.234,56`, parentheses negatives, credit notes) can mis-parse. Credit notes (`Credit Note CN-*`) are present in samples — negative totals may post incorrectly.

### 3. Validation
- **Validation gaps:** the strongest validation is the DB UNIQUE constraint on `invoice_number`/`source_message_id` and tombstone checks. There is **no business validation** that `amount > 0`, `vendor != Unknown`, `office` resolvable, or `due_date >= invoice_date` before an invoice can be approved/billed.
- **"Unknown" vendor** invoices can still flow through; bill creation then fails or creates a stray vendor.

### 4. Routing (vendor & clinic matching)
- **Vendor matching failures:** string-based (`vendorNormalization`, fuzzy `findVendorKey`) → "Henry Schein" vs "HENRY SCHEIN INC." vs "Henry Schein Inc" must collapse to one QBO vendor; misses create duplicate QBO vendors via `ensureVendor`.
- **Clinic matching failures:** the **Roseburg billing-address trap** is the #1 documented hazard — parsers must select Ship-To, not Bill-To. If wrong, the QBO **Class/Location is wrong**, misallocating the expense to the wrong clinic. Some locations seeded in `clinics` (Longview, Hazel Dell, Snohomish) don't match the `office_managers` keys in `roles.json` (Milwaukie, Roseburg, Eugene, Lebanon, Ridgefield, Riddle, Salem, Columbia) — **the clinic list and the roles/office list disagree**, so several real clinics have no office manager and vice-versa.
- **Routing default:** when office is unknown, the engine routes to admin — safe-ish, but combined with `test_mode_route_all_to_admin` everything goes to admin anyway.

### 5. Duplicate invoice risks
- **Schema vs logic conflict:** `invoice_number` is globally UNIQUE, but dedup logic keys on `invoice_number`+`vendor`. Two vendors sharing an invoice number → UNIQUE failure drops the second invoice (silent loss) or a suffix workaround corrupts the number. (BUG_CATALOG B3)
- **Re-ingestion:** tombstones prevent re-adding rejected invoices, but tombstone is keyed on `source_file`/`source_message_id`; the same invoice arriving from a different email (forwarded) has a new message id and re-enters.

### 6. Approval
- See FINANCIAL_CONTROLS_AUDIT. Key pipeline risk: **bill creation failure does not stop approval**, producing `to_be_paid` invoices with no QBO bill, which then error at the pay step or get `mark_paid` with no bill.

### 7. Accounting export / QBO sync
- **GL line splitting** from `invoice_categories` can post lines whose amounts don't sum to the total; a balancing line is auto-inserted (integrity risk, QBO audit §8).
- **No idempotency** → duplicate bills under concurrency/retry (QBO audit §4).
- **PDF attachment** is best-effort; failures are logged but the bill is still created without its supporting document (audit/compliance gap).

---

## Failure points (single points where the pipeline stalls or loses data)

| Point | Symptom | Mitigation today |
|---|---|---|
| IMAP watcher down | No new invoices | none (no alert) |
| Local disk loss | Source PDFs gone | ad-hoc only |
| Multi-invoice mis-split | Missing/duplicated invoices | none automated |
| Low-confidence parse proceeds | Wrong amount/vendor billed | `repair` status manual |
| Roseburg/Ship-To confusion | Wrong clinic class | prompt rule only |
| invoice_number UNIQUE clash | Second invoice dropped | none |
| QBO bill create fails | `to_be_paid` w/o bill | logged, not blocked |
| Concurrent approve | Duplicate QBO bills | none |

---

## Recommendations
1. Enforce a **pre-approval validation gate**: amount>0, vendor≠Unknown/resolvable to QBO, office resolvable, dates sane, parsing_confidence ≥ threshold → else force `repair`.
2. Make `invoice_number` unique **per vendor (+tenant)**; reconcile schema with dedup logic.
3. **Fail-closed** bill creation during approval; idempotent, transactional bill creation.
4. Reconcile the `clinics` table with `roles.json` office keys so every clinic has an owner and a valid QBO class.
5. Move source PDFs to object storage; add intake/parse failure alerting and a dead-letter queue.
6. Wire the `output_jsons/` corpus into a parser regression test in CI.
7. Confidence-gate OCR; special-case credit notes / negative totals.
