#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Maxxeus': `You are parsing invoices from Maxxeus.

VENDOR IDENTIFICATION:
- Primary Name: Maxxeus
- Address: 349 South Main Street, Dayton, Ohio 45402
- Distribution: 2900 College Dr., Kettering, OH 45420
- Phone: (800)-684-7783 Ext. 3
- Email: arinfo@maxxeus.com
- NEW Lockbox: PO BOX 18563, PALATINE, IL 60055-8563
- THIS IS A DENTAL BONE GRAFT SUPPLIER

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                    INVOICE                  │
│ 349 South Main Street, Dayton, Ohio 45402         Invoice No.    I0997866   │
│ Distribution: 2900 College Dr., Kettering, OH     Date           9/3/2025   │
│                                                   Order No.      S0965421   │
│ Phone (800)-684-7783 Ext. 3                       Customer ID    T117502    │
│ arinfo@maxxeus.com                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILL TO:                              SHIP TO:                              │
│ PACIFIC CREST DENTAL - ROSEBURG       Pacific Crest Dental - Rosebur        │
│ ATTN: ACCOUNTS PAYABLE                1683 W Harvard Ave                    │
│ 1683 W HARVARD AVE.                   Roseburg, OR 97471-2812               │
│ ROSEBURG, OR 97471                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ ORDER NO. | ORDERED BY | ORDER DATE | CUSTOMER P.O. NO. | TERMS             │
│ 407-985417 | Wendy D/MB | 9/3/2025 | 392875 CCARD | Net 30                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ QUANTITY | ITEM CODE | DESCRIPTION | UNIT PRICE | FEE                       │
│ 5.00 | 48-8210 DH005 | Corticocancellous 0.25-1.0 mm / 0.5 cc | 50.00 | 250.00│
│ 10.00 | 48-6720 DH010 | Corticocancellous 0.25-1.0 mm / 1.0 cc | 67.00 | 670.00│
├─────────────────────────────────────────────────────────────────────────────┤
│                                    Sales Total            920.00            │
│ ACH: Routing#:075900575 Acct#:2919669073                                    │
│ Wire: Routing#:075900575 Acct#:2919669073                  Shipping         20.00│
│ SWIFT Code:ABGBUS44 $USD                                  Tax Total        0.00│
│ Finance charge: 1.5%/month on unpaid                                       940.00│
│                                                           Amount Paid      940.00│
│                                                           AMOUNT DUE       $0.00│
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice No."
   - Format: I + 7 digits (e.g., I0997866)

2. INVOICE DATE:
   - Position: Top right, "Date"
   - Format: M/D/YYYY (e.g., 9/3/2025)

3. DUE DATE:
   - From Terms: "Net 30"
   - Calculate: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: "AMOUNT DUE" at bottom
   - Check if prepaid (shows $0.00 if paid by card)
   - Use "Sales Total" + "Shipping" for actual amount

5. ORDER NUMBER:
   - Position: Order table row
   - Format: XXX-XXXXXX (e.g., 407-985417)

6. CUSTOMER ID:
   - Position: Top right
   - Format: T + 6 digits (e.g., T117502)

7. SHIP-TO / LOCATION:
   - Position: "SHIP TO:" section
   - Example: "Pacific Crest Dental - Rosebur... Roseburg, OR" → Roseburg

8. LINE ITEMS:
   - Bone graft products with specific item codes
   - Common products: Corticocancellous bone graft

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Location-Specific:
- General-Roseburg: Dental Supplies Inventory (2 historical occurrences)
Bone graft supplier - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract I + 7 digit invoice number
2. Convert M/D/YYYY to YYYY-MM-DD
3. Check for prepaid (CCARD in P.O.)
4. Include shipping in total
5. Terms: Net 30`,

  'Deluxe': `You are parsing invoices from Deluxe.

VENDOR IDENTIFICATION:
- Primary Name: Deluxe
- Also appears as: Deluxe Corp, Deluxe Corporation
- Remit to: LOCKBOX 229, P.O. BOX 7247, PHILADELPHIA, PA 19170-0001
- Phone: 800-328-0304
- Tax EIN: 20-2945889
- THIS IS A CHECK/FORMS PRINTING COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ PO BOX 818095                                                               │
│ Cleveland, OH 44181                                     INVOICE             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILL TO                               SHIP TO                               │
│ CTR SERVICES NORTHWEST LLC            CTR SERVICES NORTHWEST LLC            │
│ 1683 W HARVARD AVE                    2227 S 89TH CT                        │
│ ROSEBURG OR 97471                     OMAHA NE 68124-207                    │
│                                                                             │
│                                       ISSUANCE DATE     9/18/2025           │
│                                       DUE DATE          9/18/2025           │
│                                       CUSTOMER ID       609398734           │
│                                       INVOICE NUMBER    9008841226          │
│                                       PO NUMBER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ PRODUCT NUMBER | SHIP DATE | DESCRIPTION | RATE | VOLUME | UOM | DISCOUNT | AMOUNT│
│ DLA104-1 | 09/18/2025 | Laser 3-To-A-Page Checks, Lined | 0.68797 | 300 | EA | 0.00 | 206.39│
│                       | Order#:02057464631                                  │
│ LOGOCH | 09/18/2025 | Custom Logo w/ Chng | 6.39000 | 1 | EA | 0.00 | 6.39 │
├─────────────────────────────────────────────────────────────────────────────┤
│ PRODUCTS & SERVICES SUBTOTAL                              212.78            │
│ ORDER DISCOUNTS                                           0.00              │
│ SHIPPING & PROCESSING                                     26.93             │
│ TAX EIN 20-2945889                                        16.78             │
│ INVOICE AMOUNT                                            256.49            │
│ PAYMENTS & ADJUSTMENTS                                    -256.49           │
│ AMOUNT DUE (USD)                                          $ 0.00            │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header section, "INVOICE NUMBER"
   - Format: 10-digit (e.g., 9008841226)

2. INVOICE DATE:
   - Position: "ISSUANCE DATE" in header
   - Format: M/DD/YYYY (e.g., 9/18/2025)

3. DUE DATE:
   - Position: "DUE DATE" in header
   - Often same as issuance date (auto-debit)

4. TOTAL AMOUNT:
   - Position: "AMOUNT DUE (USD)" at bottom
   - Check "INVOICE AMOUNT" for actual total
   - May show $0.00 if auto-debited

5. CUSTOMER ID:
   - Position: Header section
   - Format: 9-digit (e.g., 609398734)

6. PRODUCT DETAILS:
   - Laser checks, deposit slips, custom logos
   - Product numbers like DLA104-1

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses
Check printing/forms - use Office Expenses
Note: "Electronically Debited" if auto-pay setup
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 10-digit invoice number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "INVOICE AMOUNT" as total (not Amount Due)
4. Auto-debit noted - may show $0 due
5. Include shipping and tax`,

  'Rectangle Health': `You are parsing invoices from Rectangle Health.

VENDOR IDENTIFICATION:
- Primary Name: Rectangle Health
- Address: 115 E STEVENS AVE, FL. 3, VALHALLA NY 10595
- THIS IS A PAYMENT PROCESSING/EQUIPMENT VENDOR - card terminals

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                              Invoice                        │
│ 115 E STEVENS AVE.                           #INV248337                     │
│ FL. 3                                                                       │
│ VALHALLA NY 10595                            10/31/2025                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill To                    Ship To                    TOTAL                 │
│ Pacific Crest Smiles       Pacific Crest Smiles                             │
│ Columbia                   Columbia                                          │
│ 1000 12th Avenue Unit 103  16415 SE 15th Street Ste 105                    │
│ Longview WA 98632          Vancouver WA 98683         $97.56                │
│                                                       Due Date: 10/31/2025  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Terms | Due Date | PO # | Sales Rep | Shipping Method                       │
│       | 10/31/2025 |     |           | FedEx                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Quantity | Item | Options | Unit Price | Amount                             │
│ 1 | Magtek - Encrypted Keyboard |  | $90.00 | $90.00                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                         Subtotal        $90.00              │
│                                         Tax Total (%)   $7.56               │
│                                         Total           $97.56              │
│                                         Unpaid Balance  $97.56              │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "#INV" prefix
   - Format: #INVXXXXXX (e.g., #INV248337)
   - Extract: INV248337

2. INVOICE DATE:
   - Position: Below invoice number
   - Format: MM/DD/YYYY (e.g., 10/31/2025)

3. DUE DATE:
   - Position: "Due Date:" in header
   - Format: MM/DD/YYYY

4. TOTAL AMOUNT:
   - Position: "Unpaid Balance" or "Total" at bottom
   - Format: Dollar amount (e.g., $97.56)

5. SHIP-TO / LOCATION:
   - Position: "Ship To" section
   - Example: "Pacific Crest Smiles Columbia... Vancouver WA" → Columbia

6. LINE ITEMS:
   - Payment processing equipment
   - Quantity | Item | Options | Unit Price | Amount

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53400 Equipment
OR: Office Expenses for smaller items
Payment equipment - use Equipment or Office Expenses
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract INV + number from #INV format
2. Use MM/DD/YYYY date format
3. Use "Unpaid Balance" as total
4. Include tax in total
5. Ship-to location indicates office`,

  "Murphy's Law Janitorial": `You are parsing invoices from Murphy's Law Janitorial.

VENDOR IDENTIFICATION:
- Primary Name: Murphy's Law Janitorial
- Address: P.O. Box 2074, Roseburg, OR 97470
- Phone: 541-670-6330
- Email: MurphysLawJanitorial@gmail.com
- Contact: Wesley Murphy
- THIS IS A CLEANING/JANITORIAL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                           INVOICE                           │
│ P.O. Box 2074                             Invoice #      Service Month      │
│ Roseburg, OR 97470                        SD - 25110    November            │
│ 541-670-6330                              Date Submitted  Date Due          │
│                                           10/01/25        11/01/25          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill to                                                                     │
│ Takisha Pappas                                                              │
│ Smiles Dental                                                               │
│ 1683 W Harvard Ave                                                          │
│ Roseburg, OR 97471                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Description                                              Amount             │
│ Deluxe Janitorial Services                               $1,355.00          │
│ 1683 W Harvard Ave, Roseburg, OR 97471                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                           TOTAL          $1,355.00          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Make checks payable to Murphy's Law Janitorial.                            │
│ Wesley Murphy 541-670-6330                                                  │
│ MurphysLawJanitorial@gmail.com                                             │
│ It's a pleasure doing business with you!                                   │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: "Invoice #" in header
   - Format: SD - XXXXX (e.g., SD - 25110)

2. SERVICE MONTH:
   - Position: Next to invoice number
   - Shows: Month name (e.g., November)

3. INVOICE DATE:
   - Position: "Date Submitted"
   - Format: MM/DD/YY (e.g., 10/01/25)
   - CONVERT TO YYYY-MM-DD (2025-10-01)

4. DUE DATE:
   - Position: "Date Due"
   - Format: MM/DD/YY

5. TOTAL AMOUNT:
   - Position: "TOTAL" at bottom
   - Format: Dollar amount (e.g., $1,355.00)

6. SERVICE LOCATION:
   - Position: "Bill to" section AND description
   - Shows full address

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
Location-Specific:
- General-Roseburg: 53224 Uniforms & Cleaning (historical)
Janitorial service - use Uniforms & Cleaning
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract SD - XXXXX invoice number
2. Convert MM/DD/YY to YYYY-MM-DD
3. Use "TOTAL" as amount
4. Monthly recurring service
5. Make checks payable to Murphy's Law Janitorial`,

  'Henry Schein, Inc.': `You are parsing invoices from Henry Schein, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Henry Schein, Inc.
- Also appears as: Henry Schein
- HSI Federal ID#: 11-3136595
- HSI D&B#: 01-243-0880
- THIS IS A MAJOR DENTAL SUPPLY DISTRIBUTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                         INVOICE                       Ship/Sold-To: 4434149 │
│                                                       Smiles Dental Eugene  │
│                                                       2201 Willamette St    │
│                                                       Matthew Collins       │
│                                                       Eugene, OR 97405-3091 │
│ 010000443414349139884110000000000156891104259                               │
│                                                       Bill-To: 4434143      │
│                                                       Pacific Crest Smiles  │
│                                                       1683 W Harvard Ave    │
│                                                       ATTN: Accounts Payable│
│                                                       Roseburg, OR 97471-2812│
├─────────────────────────────────────────────────────────────────────────────┤
│ Invoice#   Invoice Date   Due Date   Invoice Total                          │
│ 49139884   11/04/25       12/04/25   $156.89                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Purchase Order#     Payment Terms                                           │
│ P10430              Invoice Date + 30 days                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ LINE | ITEM CODE | UNIT SIZE | DESCRIPTION | QTY ORD | QTY SHIP | CODES | UNIT PRICE | EXT. PRICE│
│ 1 | 900-7439 | 200/BX | Criterion N200 Glove Blue Nitrile M | 20 | 20 | C | 7.52 | 150.40│
│   |          |        | ** SPECIAL CONTRACT PRICE **                        │
│   |          |        | TCN: P10430   M/F: DR. COLLINS                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                    MERCHANDISE TOTAL         $150.40        │
│                                    FREIGHT CHARGES           $6.49          │
│                                    INVOICE TOTAL             $156.89        │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Summary table, "Invoice#"
   - Format: 8-digit (e.g., 49139884)

2. INVOICE DATE:
   - Position: Summary table, "Invoice Date"
   - Format: MM/DD/YY (e.g., 11/04/25)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: Summary table, "Due Date"
   - Format: MM/DD/YY
   - Terms: Invoice Date + 30 days

4. INVOICE TOTAL:
   - Position: "INVOICE TOTAL" at bottom
   - Format: Dollar amount (e.g., $156.89)

5. SHIP-TO NUMBER:
   - Position: Top right, "Ship/Sold-To:"
   - Format: 7-digit (e.g., 4434149)
   - CRITICAL for office identification

6. SHIP-TO LOCATION:
   - Position: Below Ship/Sold-To number
   - Shows: Office name and address
   - Example: "Smiles Dental Eugene... Eugene, OR" → Eugene

7. BILL-TO NUMBER:
   - Position: "Bill-To:" in header
   - Central billing account number

8. LINE ITEMS:
   - LINE | ITEM CODE | UNIT SIZE | DESCRIPTION | QTY ORD | QTY SHIP | CODES | UNIT PRICE | EXT. PRICE
   - Includes merchandise and freight

OFFICE LOCATION MAPPING (by Ship-To#):
- 4434149 → Eugene
- 4434143 → Roseburg (also Bill-To)
- Other numbers map to specific offices

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Location-Specific:
- General-Eugene: 10210 Dental Supplies Inventory
- General-Roseburg: 10210 Dental Supplies Inventory
Dental supplies - ALWAYS use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 8-digit invoice number
2. Convert MM/DD/YY to YYYY-MM-DD
3. Use "INVOICE TOTAL" as amount
4. Include freight in total
5. Use Ship-To# for office location
6. Handle multi-page invoices (sum all pages)`,

  'Linde Gas & Equipment Inc.': `You are parsing invoices from Linde Gas & Equipment Inc.

VENDOR IDENTIFICATION:
- Primary Name: Linde Gas & Equipment Inc.
- Also appears as: Linde, Linde Gas
- THIS IS A MEDICAL GAS SUPPLIER - N2O, O2, nitrogen

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar format to Industrial Source and Airgas - medical gas delivery.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"
   - Standard terms: Net 30

4. TOTAL AMOUNT:
   - Look for: "Total", "Invoice Total", "Amount Due"
   - Position: Bottom of invoice

5. DELIVERY LOCATION:
   - Shows which office received gas delivery

6. GAS PRODUCTS:
   - Nitrous Oxide (N2O) cylinders
   - Oxygen (O2) cylinders
   - May include rental/return tracking

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases
Medical gas supplier - ALWAYS use Medical Gases expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Sum gas product costs + fees for total
4. Include cylinder rental fees
5. Track delivery location for office assignment`,

  'National Interpreting Service, Inc.': `You are parsing invoices from National Interpreting Service, Inc.

VENDOR IDENTIFICATION:
- Primary Name: National Interpreting Service, Inc.
- Also appears as: National Interpreting Service
- THIS IS AN INTERPRETING SERVICE - medical/dental interpretation

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar to Passport to Languages and Signing Resources.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"
   - Standard: Net 30 or Due on Receipt

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE DETAILS:
   - Service date
   - Patient/client name
   - Language interpreted
   - Interpreter name
   - Hours/duration

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Professional Services
Interpreting service - use Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Track service details for reconciliation`,

  'TechEdge Patterson Technical Service': `You are parsing invoices from TechEdge Patterson Technical Service.

VENDOR IDENTIFICATION:
- Primary Name: TechEdge Patterson Technical Service
- Also appears as: TechEdge, Patterson TechEdge
- Affiliated with: Patterson Dental
- THIS IS AN EQUIPMENT SERVICE/REPAIR COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Equipment service and repair invoices.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Service Order #"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"
   - May include parts + labor

5. SERVICE LOCATION:
   - Shows which office was serviced

6. SERVICE DETAILS:
   - Equipment type
   - Work performed
   - Parts used
   - Labor hours

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53400 Equipment:53410 Equipment Repair & Maintenance
Equipment service - use Equipment Repair & Maintenance
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/service order number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Include parts and labor`,

  'NRC Service': `You are parsing invoices from NRC Service.

VENDOR IDENTIFICATION:
- Primary Name: NRC Service
- THIS IS A SERVICE COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Service invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or appropriate service expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  "Physician's Resource": `You are parsing invoices from Physician's Resource.

VENDOR IDENTIFICATION:
- Primary Name: Physician's Resource
- Also appears as: Physicians Resource
- THIS IS A MEDICAL SUPPLY/SERVICE VENDOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Medical/dental supply or service invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Example format: 031516

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Dental Supplies or Contract Services depending on item
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Fyle, Inc.': `You are parsing invoices from Fyle, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Fyle, Inc.
- Also appears as: Fyle Inc
- THIS IS AN EXPENSE MANAGEMENT SOFTWARE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
SaaS subscription invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SUBSCRIPTION DETAILS:
   - Service period
   - Number of users
   - Plan type

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
Software subscription - use Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Note subscription period`,

  'TrustWorkz, Inc.': `You are parsing invoices from TrustWorkz, Inc.

VENDOR IDENTIFICATION:
- Primary Name: TrustWorkz, Inc.
- Also appears as: Trustworkz Inc, TrustWorkz
- THIS IS A MARKETING/DIGITAL SERVICES COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Marketing/professional services invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE DETAILS:
   - Marketing services
   - Digital advertising
   - Website services

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:54000 Other Expenses:54200 Advertising & Marketing:54210 Digital Marketing
Marketing services - use Advertising & Marketing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'MedPro Waste Disposal, LLC': `You are parsing invoices from MedPro Waste Disposal, LLC.

VENDOR IDENTIFICATION:
- Primary Name: MedPro Waste Disposal, LLC
- Also appears as: MedPro Waste Disposal
- THIS IS A MEDICAL WASTE DISPOSAL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar to Stericycle - medical waste pickup invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"
   - Standard: Net 30

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE LOCATION:
   - Shows which office was serviced

6. WASTE DETAILS:
   - Container type/size
   - Pickup date
   - Manifest number

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53225 Hazardous Disposal
Medical waste disposal - use Hazardous Disposal expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Track service location`,

  'USPS': `You are parsing invoices from USPS.

VENDOR IDENTIFICATION:
- Primary Name: USPS
- Also appears as: United States Postal Service
- THIS IS POSTAGE/MAILING EXPENSES

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Postal receipt/invoice format - may be email or scanned receipt.

FIELD LOCATIONS:

1. TRANSACTION/INVOICE NUMBER:
   - Look for: Transaction ID, Receipt #

2. DATE:
   - Look for: Date, Transaction Date

3. TOTAL AMOUNT:
   - Look for: Total, Amount

5. SERVICE TYPE:
   - First Class, Priority Mail, Certified Mail, etc.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53221 Postage & Shipping
Postage - ALWAYS use Postage & Shipping expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract transaction/receipt number
2. Use transaction date
3. Use Total as amount
4. Note service type for tracking`,

  'Pacific Crest Smiles': `You are parsing invoices from Pacific Crest Smiles.

VENDOR IDENTIFICATION:
- Primary Name: Pacific Crest Smiles
- NOTE: This may be an internal transfer or inter-company charge
- THIS IS THE COMPANY ITSELF

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Internal/inter-company invoice format.

SPECIAL HANDLING:
This vendor name matches the company - may be:
1. Internal transfer between locations
2. Inter-company billing
3. Misclassified vendor (should be another vendor)

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
REVIEW REQUIRED: This may be an internal transfer
Verify the actual vendor before categorizing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. FLAG FOR REVIEW - vendor matches company name
2. Check actual invoice source
3. May need vendor name correction`,

  'Otis Electric, LLC': `You are parsing invoices from Otis Electric, LLC.

VENDOR IDENTIFICATION:
- Primary Name: Otis Electric, LLC
- Also appears as: Otis Electric
- THIS IS AN ELECTRICAL CONTRACTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Electrical service/repair invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE DETAILS:
   - Work performed
   - Parts/materials
   - Labor hours

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services
Electrical service - use Contract Services or Repairs & Maintenance
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Include parts and labor`,

  'Marion Environmental Services': `You are parsing invoices from Marion Environmental Services.

VENDOR IDENTIFICATION:
- Primary Name: Marion Environmental Services
- THIS IS A WASTE/ENVIRONMENTAL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Environmental/waste service invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Hazardous Disposal depending on service type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Comcast Business': `You are parsing invoices from Comcast Business.

VENDOR IDENTIFICATION:
- Primary Name: Comcast Business
- Also appears as: Comcast
- THIS IS AN INTERNET/PHONE SERVICE PROVIDER

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Utility-style monthly billing invoice.

FIELD LOCATIONS:

1. ACCOUNT NUMBER:
   - Look for: "Account Number", "Acct #"
   - Multiple accounts for different locations

2. INVOICE DATE:
   - Look for: "Statement Date", "Bill Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total Due", "Amount Due", "New Charges"

5. SERVICE ADDRESS:
   - Shows which office location

6. SERVICE DETAILS:
   - Internet service
   - Phone lines
   - Equipment rental

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53110 Internet & Phone
Internet/phone service - use Internet & Phone expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract account number
2. Use statement/bill date
3. Use "Total Due" or "Amount Due" as total
4. Match service address to office location
5. Monthly recurring charge`
};

let updated = 0;
let errors = 0;

for (const [vendorName, prompt] of Object.entries(vendors)) {
  try {
    const result = db.prepare(`
      UPDATE vendor_knowledge_bases 
      SET knowledge_prompt = ?, updated_at = datetime('now')
      WHERE vendor_name = ?
    `).run(prompt, vendorName);
    
    if (result.changes > 0) {
      console.log(`✓ ${vendorName} updated`);
      updated++;
    } else {
      console.log(`○ ${vendorName} not found in database`);
    }
  } catch (err) {
    console.error(`✗ ${vendorName}: ${err.message}`);
    errors++;
  }
}

console.log(`\nSummary: ${updated} updated, ${errors} errors`);
db.close();
