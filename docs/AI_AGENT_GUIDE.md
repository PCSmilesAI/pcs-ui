# PCS AI Platform — Agent Guide

**Give this file to your AI agent at the start of every session where you are building in the PCS AI platform.**

This document tells your AI exactly how the codebase is structured, which files it owns, which files it must never touch, and what patterns to follow so that multiple people building simultaneously do not break each other's work.

---

## Platform Overview

PCS AI (pcsmilesai.com) is a shared internal platform for Pacific Coast Smiles (PCS), a dental support organization with eight practices. The platform is a Next.js 14 application backed by SQLite, hosted on DigitalOcean. The GitHub repo is `PCSmilesAI/pcs-ui`.

The platform is modular. Each module is an independent feature area with its own pages, API routes, and service files, all sharing the same authentication, database connection, navigation shell, and deployment pipeline.

Current modules:
- **AP Invoice Processing** — owned by Braxton
- **Credit Card Receipts** — owned by McKay

---

## Repository Map

```
pcs-ui/
├── app/                          Next.js App Router
│   ├── layout.tsx                Root layout — DO NOT EDIT
│   ├── page.tsx                  Root redirect — DO NOT EDIT
│   ├── api/                      API route handlers
│   │   ├── invoices/             AP invoice routes — BRAXTON ONLY
│   │   ├── receipts/             Receipts routes — MCKAY ONLY
│   │   ├── qbo/                  QuickBooks routes — BRAXTON ONLY
│   │   ├── auth/                 Auth routes — DO NOT EDIT
│   │   └── ...                   Other shared routes
│   ├── CreditCardReceiptsPage/   Receipts page shell — MCKAY ONLY
│   └── [OtherPages]/             AP module pages — BRAXTON ONLY
│
├── src/
│   ├── ui-pages/
│   │   ├── CreditCardReceiptsPage.jsx    MCKAY ONLY
│   │   └── [other pages].jsx            BRAXTON ONLY
│   └── components/
│       ├── NavBar.jsx            Shared nav — DO NOT EDIT without coordinating
│       ├── AppLayout.jsx         Shared layout — DO NOT EDIT without coordinating
│       └── [other components]    Shared — coordinate before editing
│
├── lib/
│   ├── receipts/                 MCKAY ONLY
│   │   ├── db-store.ts           Receipt DB reads/writes
│   │   └── receipt-service.ts    Receipt business logic + AI
│   ├── invoices/                 BRAXTON ONLY
│   ├── db/                       Shared DB — DO NOT EDIT without coordinating
│   │   └── client.ts             Add receipts table migration here
│   ├── auth/                     Shared auth — DO NOT EDIT
│   ├── qbo/                      QuickBooks — BRAXTON ONLY
│   └── gpt/                      Shared AI helpers — coordinate before editing
│
├── context/                      AI agent context files
│   ├── company/pcs_overview.md   Company facts — read-only for agents
│   ├── verticals/accounting.md   GL accounts, AP rules — read-only for agents
│   ├── modules/ap_invoices.md    AP module context — read-only for agents
│   ├── modules/credit_card_receipts.md   Receipts module context — read-only for agents
│   └── vendors/tc_dental.md      TC Dental parser rules — read-only for agents
│
├── docs/
│   ├── AI_AGENT_GUIDE.md         This file
│   ├── DEVELOPER_SETUP.md        Setup instructions
│   └── runbooks/                 Operations guides
│
└── pcs_ai_data/
    └── chart_of_accounts.json    Full GL account list (read only)
```

---

## McKay's Sandbox — Credit Card Receipts Module

If you are McKay's AI agent, these are the only files you should create or modify:

### Files You Own
```
lib/receipts/db-store.ts
lib/receipts/receipt-service.ts
app/api/receipts/route.ts
app/api/receipts/[id]/route.ts
src/ui-pages/CreditCardReceiptsPage.jsx
app/CreditCardReceiptsPage/page.tsx      (only if adding metadata/layout)
```

### One File to Add a Migration To
```
lib/db/client.ts    → add the receipts table to runMigrations() ONLY
                      follow the existing migration pattern exactly
                      do not change any existing migration block
```

### Files You Must Never Touch
```
app/layout.tsx
app/page.tsx
app/api/invoices/**
app/api/qbo/**
app/api/auth/**
src/components/NavBar.jsx
src/components/AppLayout.jsx
src/ui-pages/[anything except CreditCardReceiptsPage.jsx]
lib/invoices/**
lib/qbo/**
lib/auth/**
lib/db/client.ts     (except adding one migration block for receipts table)
pcs_ai_data/**
```

### Your Branch
Always work on: `feature/credit-card-receipts`

```bash
git checkout feature/credit-card-receipts
git pull origin feature/credit-card-receipts
```

Never commit directly to `main` or `staging`.

---

## Crozier's Sandbox — Analytics / BI

If you are Crozier's AI agent, create a `feature/analytics` branch from `main` and contain your work to:

```
app/api/analytics/**      (new folder — create it)
app/AnalyticsPage/**      (new folder — create it if building a UI)
src/ui-pages/AnalyticsPage.jsx    (new file — create it)
lib/analytics/**          (new folder — create it)
```

To add your module to the platform nav, coordinate with Braxton to add one entry to `NavBar.jsx` and `AppLayout.jsx` following the existing pattern.

---

## Shared Patterns — Follow These Exactly

### 1. Database Connection

```typescript
import { getDatabase } from '@/lib/db/client';

const db = getDatabase();
const result = db.prepare('SELECT * FROM your_table WHERE id = ?').get(id);
```

Never open a new database connection directly. Always use `getDatabase()`.

### 2. Adding a Database Table (Migration Pattern)

Find the `runMigrations()` function in `lib/db/client.ts`. Add a new block following this exact pattern:

```typescript
// ─── Receipts table ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id            TEXT PRIMARY KEY,
    vendor        TEXT,
    amount        REAL,
    date          TEXT,
    gl_account    TEXT,
    location      TEXT,
    card_last4    TEXT,
    match_status  TEXT DEFAULT 'unmatched',
    amex_txn_id   TEXT,
    submitted_by  TEXT,
    notes         TEXT,
    image_path    TEXT,
    created_at    TEXT,
    updated_at    TEXT
  )
`);
```

Do not modify any existing `CREATE TABLE` statements.

### 3. Authentication Check

```typescript
import { getCurrentUser } from '@/lib/auth/currentUser';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... your logic
}
```

### 4. API Response Shape

All API responses follow this shape:

```typescript
// Success — single item
return NextResponse.json({ receipt: receiptObject });

// Success — list
return NextResponse.json({ receipts: arrayOfReceipts });

// Error
return NextResponse.json({ error: 'Human-readable message' }, { status: 400 });
```

### 5. Model Configuration — CRITICAL

**Never hard-code a model name anywhere in the codebase.**

Always read from environment variables:

```typescript
const provider = process.env.PCS_LLM_PROVIDER ?? 'openai';
const model    = process.env.PCS_LLM_MODEL    ?? 'gpt-4o';
```

This is how PCS can swap models (Claude ↔ OpenAI ↔ local/Llama) without changing code.

### 6. File Upload / Storage

Uploaded files (receipt images, PDFs) are stored in the `email_invoices/` directory pattern. Use a consistent path:

```typescript
const filePath = path.join(process.cwd(), 'email_invoices', 'receipts', filename);
```

The `email_invoices/` folder is gitignored — files are server-local only.

### 7. Error Handling

```typescript
try {
  // your logic
} catch (err: any) {
  console.error('[receipts] descriptive message:', err?.message);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

Always include a module prefix in console.error logs (e.g., `[receipts]`).

---

## How to Load Context Files

Your AI agent should load context files at the start of relevant tasks. Load only what you need:

| Task | Context Files to Load |
|------|-----------------------|
| Anything in PCS | `context/company/pcs_overview.md` |
| GL coding / AP logic | + `context/verticals/accounting.md` |
| Building receipts module | + `context/modules/credit_card_receipts.md` |
| Building AP invoice logic | + `context/modules/ap_invoices.md` |
| TC Dental parsing | + `context/vendors/tc_dental.md` |

In Python (McKay's receipt agent example):
```python
def load_context(files: list[str]) -> str:
    context = ""
    for path in files:
        with open(path, "r") as f:
            context += f.read() + "\n\n"
    return context

system_prompt = load_context([
    "context/company/pcs_overview.md",
    "context/verticals/accounting.md",
    "context/modules/credit_card_receipts.md",
])
```

---

## How to Add a New Module

Follow this checklist when adding a new module to the PCS AI platform:

1. **Create your branch:** `git checkout -b feature/your-module-name`
2. **Create the UI page:** `src/ui-pages/YourModulePage.jsx`
3. **Create the route shell:** `app/YourModulePage/page.tsx` (copy the pattern from `app/CreditCardReceiptsPage/page.tsx`)
4. **Create API routes:** `app/api/your-module/route.ts`, `app/api/your-module/[id]/route.ts`
5. **Create service files:** `lib/your-module/db-store.ts`, `lib/your-module/your-service.ts`
6. **Add DB migration:** One new `CREATE TABLE IF NOT EXISTS` block in `lib/db/client.ts`
7. **Create context file:** `context/modules/your_module.md`
8. **Add to nav:** Coordinate with Braxton to add one button to `NavBar.jsx` and one entry to `AppLayout.jsx`
9. **Test locally:** `npm run dev` + `npm run dev:api`
10. **PR to staging first, then main**

---

## Branch and PR Workflow

```
feature/your-branch  →  staging  →  main  →  production (auto-deploy via ssh)
```

- Open a PR from your feature branch into `staging`
- Test on staging
- Open a PR from `staging` into `main`
- Braxton deploys to production:
  ```bash
  ssh root@137.184.183.253 "cd /var/www/pcs-ui && git pull origin main && npm run build && pm2 restart pcs-ui"
  ```

**Never push directly to `main`.**

---

## Production Server

- **URL:** pcsmilesai.com
- **Server:** 137.184.183.253 (DigitalOcean)
- **Repo path:** `/var/www/pcs-ui`
- **Database:** `/var/www/pcs-ui/pcs_ui_data/pcs.db` — this is the live database, treat it as sacred
- **Process manager:** PM2 (`pm2 status`, `pm2 restart pcs-ui`)

---

## Contact

| Person | Role | Contact |
|--------|------|---------|
| Braxton Ellsworth | Platform architect, AP module owner | Teams |
| McKay | Vision, credit card receipts module owner | Teams |
| Crozier | Analytics, BI | Teams |
