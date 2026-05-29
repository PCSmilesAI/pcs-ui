# Accounting Vertical — PCS

Load this file when working on any accounting, AP, GL coding, or financial workflow.

## QuickBooks Setup

PCS uses **QuickBooks Online (QBO)** as its accounting system. All expenses must be mapped to a GL account from the chart of accounts below.

**QBO Integration:** OAuth2. Tokens managed in `lib/qbo/`. Bill creation handled in `lib/qbo/bill-creation.ts`.

## Chart of Accounts (Expense Accounts)

These are the valid GL account codes for all PCS expense categorization.

### 51000 Direct Labor
- 51110 Doctor — Gross Wages
- 51120 Doctor — Bonuses
- 51130 Doctor — Employee Relations
- 51140 Doctor — Training & Continuing Education
- 51150 Doctor — Payroll Taxes
- 51160 Doctor — Employee Benefits
- 51170 Doctor — 401K Contributions
- 51180 Doctor — Contract Labor
- 51211 Hygienist — Gross Wages
- 51212 Hygienist — Bonuses
- 51213 Hygienist — Employee Relations
- 51214 Hygienist — Training & Continuing Education
- 51215 Hygienist — Payroll Taxes
- 51216 Hygienist — Employee Benefits
- 51217 Hygienist — 401K Contributions
- 51218 Hygienist — Contract Labor
- 51221 Other Direct Labor — Gross Wages
- 51222 Other Direct Labor — Bonuses
- 51225 Other Direct Labor — Payroll Taxes
- 51226 Other Direct Labor — Employee Benefits

### 52000 Direct Supplies
- 52110 Dental Supplies
- 52120 Medical Gases
- 52130 Drugs
- 52210 Dental Lab Fees
- 52220 Aligner Lab Fees

### 53000 Center Level Expenses

#### Support Labor
- 53111 Front Desk — Gross Wages
- 53112 Front Desk — Bonuses
- 53115 Front Desk — Payroll Taxes
- 53116 Front Desk — Employee Benefits
- 53117 Front Desk — 401K Contributions
- 53118 Front Desk — Contract Labor
- 53211 Office Management — Gross Wages
- 53212 Office Management — Bonuses
- 53215 Office Management — Payroll Taxes

#### Office Expenses
- 53210 Dental Equipment
- 53221 Janitorial
- 53222 Leased Equipment
- 53223 Office Supplies
- 53224 Uniforms & Cleaning
- 53225 Hazardous Disposal
- 53226 Postage
- 53227 Waste Disposal
- 53228 Lawn Care

#### Travel & Meals
- 53231 Office Drive Time
- 53232 Office Business Meals
- 53233 Office Travel
- 53234 Lodging

#### Marketing
- 53241 Online Advertising
- 53242 Printing & Distribution Marketing
- 53243 Website
- 53244 Email Marketing Services

## AP Workflow

1. Invoice received (email attachment or manual upload)
2. Vendor detected → parser selected
3. AI parses line items and suggests GL account
4. Invoice enters queue with status: `NEW`
5. State machine: `NEW → FOR_ME → TO_BE_PAID → COMPLETE`
6. Approved invoices sync to QuickBooks as Bills with PDF attachment
7. Rejected invoices move to `REJECTED` status

## Key AP Business Rules

- Lab work (TC Dental, Artisan) always categorized to 52210 or 52220, never to 52110
- Equipment over $500 → 53210 Dental Equipment
- Dental supplies under $500 → 52110 Dental Supplies
- Office supplies (non-clinical) → 53223 Office Supplies
- Each invoice is assigned to a specific practice location
- Approval routing is practice-specific (office manager approves → AP manager approves)

## Vendor-Specific Categorization Rules

| Vendor | Default Category | Notes |
|--------|-----------------|-------|
| Henry Schein | 52110 Dental Supplies | Equipment threshold: $500 |
| Patterson Dental | 52110 Dental Supplies | Equipment threshold: $500 |
| TC Dental | 52210 Dental Lab Fees | Lab work only |
| Artisan Dental | 52210 Dental Lab Fees | Custom lab items |
| Darby | 52110 Dental Supplies | |
| Benco | 52110 Dental Supplies | |
| Burkhart | 52110 Dental Supplies | Equipment threshold: $500 |
