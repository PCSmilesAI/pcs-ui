# AP Invoice Processing Module

Load this file (plus `context/verticals/accounting.md`) when working on any invoice parsing, categorization, queue management, or QuickBooks bill creation task.

## What This Module Does

Automates the full accounts payable cycle for PCS dental practices:
1. Ingests vendor invoices via email (IMAP) or manual upload
2. Detects vendor and selects the correct parser
3. Parses line items, amounts, due dates using AI + vendor-specific Python parsers
4. Assigns a GL account to each line item
5. Routes invoice through a multi-stage approval workflow
6. Creates a QuickBooks Bill and attaches the original PDF

## Key Files

| File | Purpose |
|------|---------|
| `lib/invoices/db-store.ts` | All invoice DB reads/writes |
| `lib/invoices/stateMachine.ts` | Invoice state transitions |
| `lib/gpt/parseInvoice.ts` | AI invoice parsing entry point |
| `lib/categorize.ts` | GL account suggestion logic |
| `app/api/invoices/` | Invoice API routes |
| `src/ui-pages/IncomingQueuePage.jsx` | Queue management UI |
| `src/ui-pages/InvoiceDetailPage.jsx` | Invoice detail + approval UI |
| `henry_parser.py`, `patterson_parser.py`, etc. | Vendor-specific PDF parsers (root level) |

## Invoice States

```
NEW → FOR_ME → TO_BE_PAID → COMPLETE
         ↓
      REJECTED (from any state)
```

| State | Meaning |
|-------|---------|
| NEW | Just ingested, not yet reviewed |
| FOR_ME | Assigned to an approver for review |
| TO_BE_PAID | Approved, pending QuickBooks sync |
| COMPLETE | QuickBooks Bill created and PDF attached |
| REJECTED | Declined by approver |

## Active Vendors (Live Parsers)

- TC Dental (live in production)
- Henry Schein (parser exists)
- Patterson Dental (parser exists)
- Darby (parser exists)
- Benco (parser exists)
- Burkhart (parser exists)
- Artisan Dental (parser exists)

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/invoices/visible` | Fetch invoices for current user |
| POST | `/api/invoices/ingest` | Ingest a new invoice |
| POST | `/api/invoices/gpt-ingest` | AI-powered ingestion |
| PATCH | `/api/invoices/[id]/update` | Update invoice fields |
| POST | `/api/invoices/[id]/categorize` | AI categorize line items |
| POST | `/api/invoices/transition` | Change invoice state |
| POST | `/api/invoices/pay` | Mark as paid |
| POST | `/api/invoices/export` | Export to QuickBooks |

## Model Configuration

All AI calls in this module use:
```
process.env.PCS_LLM_PROVIDER  // 'openai' | 'anthropic' | 'local'
process.env.PCS_LLM_MODEL     // e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022'
```
