# Credit Card Receipts Module

Load this file (plus `context/company/pcs_overview.md` and `context/verticals/accounting.md`) when working on any receipt parsing, Amex transaction matching, or receipt reconciliation task.

## What This Module Does

Automates credit card receipt processing for PCS:
1. Accepts receipt submissions (image upload, email, SMS — TBD)
2. AI parses receipt: vendor, amount, date, description
3. Suggests a GL account from the chart of accounts
4. Matches the parsed receipt to an Amex transaction (via Plaid or Amex API)
5. Flags unmatched or disputed receipts for human review
6. Stores reconciled receipts for accounting records

## Key Files

| File | Purpose |
|------|---------|
| `lib/receipts/db-store.ts` | All receipt DB reads/writes |
| `lib/receipts/receipt-service.ts` | AI parsing, categorization, Amex matching |
| `app/api/receipts/route.ts` | GET (list) + POST (create) receipts |
| `app/api/receipts/[id]/route.ts` | GET + PATCH individual receipt |
| `src/ui-pages/CreditCardReceiptsPage.jsx` | Full receipt module UI |

## Receipt States

```
SUBMITTED → PARSED → MATCHED → REVIEWED → COMPLETE
                   ↓
               UNMATCHED → DISPUTED
```

| State | Meaning |
|-------|---------|
| SUBMITTED | Receipt image received, not yet parsed |
| PARSED | AI has extracted vendor / amount / date |
| MATCHED | Linked to an Amex transaction |
| UNMATCHED | No Amex transaction found within tolerance |
| DISPUTED | Match rejected by reviewer |
| REVIEWED | Approved by reviewer |
| COMPLETE | Fully reconciled and coded to GL |

## Receipt Data Model

```typescript
{
  id: string              // UUID
  vendor: string          // e.g. "Amazon", "Delta Airlines"
  amount: number          // e.g. 48.50
  date: string            // ISO 8601: "2026-05-15"
  gl_account: string      // e.g. "53223 Office Supplies"
  location: string        // Practice / office (e.g. "Dentaltown Meridian")
  card_last4: string      // Last 4 digits of Amex card
  match_status: string    // 'unmatched' | 'matched' | 'disputed'
  amex_txn_id: string     // Amex transaction ID from Plaid / Amex API
  submitted_by: string    // User email
  notes: string           // Reviewer notes
  image_path: string      // Path to uploaded receipt file
  created_at: string
  updated_at: string
}
```

## Amex Transaction Matching Rules

- Amount match tolerance: ±$0.01 (exact preferred) or ±$1.00 for tax variance
- Date match tolerance: ±2 calendar days
- Vendor match: fuzzy string match (Levenshtein distance < 3, or substring match)
- Confidence score: 0.0–1.0
  - 0.95+ = auto-match
  - 0.70–0.94 = suggest match, require human confirmation
  - < 0.70 = flag as unmatched

## GL Categorization for Receipts

Common receipt categories (see `context/verticals/accounting.md` for full list):

| Receipt Type | GL Account |
|-------------|-----------|
| Office supplies (paper, pens, printer ink) | 53223 Office Supplies |
| Meals / team lunch | 53232 Office Business Meals |
| Travel (flights, Uber, parking) | 53233 Office Travel |
| Hotel / lodging | 53234 Lodging |
| Online subscriptions / software | 53223 Office Supplies or relevant account |
| Uniforms / scrubs | 53224 Uniforms & Cleaning |
| Postage / shipping | 53226 Postage |
| Dental supplies (clinical) | 52110 Dental Supplies |
| Equipment > $500 | 53210 Dental Equipment |

## Model Configuration

Always use environment variables — never hard-code a model name:
```
process.env.PCS_LLM_PROVIDER  // 'openai' | 'anthropic' | 'local'
process.env.PCS_LLM_MODEL     // e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022'
```

## Amex Integration (Planned)

- **Option A:** Plaid API (financial data aggregation)
- **Option B:** Amex MCP server (native agentic integration)
- **Option C:** CSV/XLSX statement import (manual fallback)
- McKay to determine final approach and implement in `lib/receipts/receipt-service.ts`
