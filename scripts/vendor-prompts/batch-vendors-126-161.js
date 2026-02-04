#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Method Procurement Technologies LLC': `You are parsing invoices from Method Procurement Technologies LLC.

VENDOR IDENTIFICATION:
- Primary Name: Method Procurement Technologies LLC
- Also appears as: Method Procurement, Method
- Address: 9783 E 116th St #2339, Fishers, Indiana 46037
- THIS IS A PROCUREMENT SOFTWARE SUBSCRIPTION

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                          INVOICE                            │
│ Method Procurement Technologies LLC      Invoice # 1092025-130814           │
│ 9783 E 116th St #2339                    Invoice Date Sep 10, 2025          │
│ Fishers, Indiana 46037                   Invoice Amount $872.00 (USD)       │
│                                          Customer ID AzqTkfUqTIgZH3D46      │
│                                                                             │
│                                          PAID                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILLED TO                                SUBSCRIPTION                       │
│ Laura Gorlett                            ID 169vAjUqTcEqE3dsy               │
│ Pacific Crest Smiles                     Billing Period Sep 10 to Oct 09    │
│ 1683 W Harvard Ave                       Next Billing Date Oct 10, 2025     │
│ Roseburg, Oregon 97471                                                      │
│ invoices@pacificcrestsmiles.com                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                              UNITS    UNIT PRICE    AMOUNT      │
│ Enterprise Monthly Subscription Fee        8      $109.00       $872.00     │
│ ($109/Month per Location)                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                          Total           $872.00            │
│                                          Payments       ($872.00)           │
│                                          Amount Due (USD) $0.00             │
├─────────────────────────────────────────────────────────────────────────────┤
│ PAYMENTS                                                                    │
│ $872.00 (USD) was paid on 10 Sep, 2025 by American Express card ending 1001│
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice #"
   - Format: MMDDYYYY-HHMMSS (e.g., 1092025-130814)

2. INVOICE DATE:
   - Position: "Invoice Date"
   - Format: Month DD, YYYY (e.g., Sep 10, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Subscription - prepaid by card
   - Shows "PAID" status

4. TOTAL AMOUNT:
   - Position: "Invoice Amount" in header
   - Format: $XXX.XX (USD)
   - May show $0.00 Amount Due if prepaid

5. CUSTOMER ID:
   - Position: Header area
   - Format: Alphanumeric

6. SUBSCRIPTION DETAILS:
   - ID (subscription identifier)
   - Billing Period
   - Next Billing Date
   - Units = number of locations

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
Procurement software - use Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract MMDDYYYY-HHMMSS invoice number
2. Convert "Month DD, YYYY" to YYYY-MM-DD
3. Use "Invoice Amount" as total
4. Usually prepaid (check PAID status)
5. Track number of locations (units)`,

  'Do Good Cleaning Services LLC': `You are parsing invoices from Do Good Cleaning Services LLC.

VENDOR IDENTIFICATION:
- Primary Name: Do Good Cleaning Services LLC
- Also appears as: Do Good Cleaning
- Phone: (503)400-7663
- Email: albert@dogoodcleans.com
- Website: DoGoodCleans.com
- THIS IS A CLEANING/JANITORIAL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│           Do Good Cleaning Services LLC                                     │
│ (503)400-7663 | albert@dogoodcleans.com | DoGoodCleans.com                 │
├─────────────────────────────────────────────────────────────────────────────┐
│ RECIPIENT:                                Invoice #240                      │
│ Pacific Crest Smiles                      Issued          Oct 01, 2025      │
│ 2245 Mission Street Southeast             Due             Oct 01, 2025      │
│ Salem, Oregon 97302                       Total           $900.00           │
│                                           Account Balance $900.00           │
├─────────────────────────────────────────────────────────────────────────────┤
│ For your Do Good Clean October 2025                                         │
│ Product/Service | Description | Qty. | Unit Price | Total                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Oct 03, 2025                                                                │
│ Professional Office Cleaning-Weekly 10/3/25                                 │
│ Professional Office Cleaning to Include:   1     $180.00     $180.00       │
│ Offices, Hallways, General Areas...                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Oct 10, 2025                                                                │
│ Professional Office Cleaning-Weekly        1     $180.00     $180.00       │
│ ... (more weekly cleaning entries)                                         │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side header, "Invoice #"
   - Format: 3-digit (e.g., 240)

2. INVOICE DATE:
   - Position: "Issued" in header
   - Format: Month DD, YYYY (e.g., Oct 01, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: "Due" in header
   - Format: Month DD, YYYY
   - Often same as issue date

4. TOTAL AMOUNT:
   - Position: "Total" in header OR "Account Balance"
   - Format: Dollar amount (e.g., $900.00)

5. SERVICE LOCATION:
   - Position: "RECIPIENT:" section
   - Shows office address

6. LINE ITEMS:
   - Weekly cleaning services by date
   - Product/Service | Description | Qty. | Unit Price | Total

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
Cleaning service - use Uniforms & Cleaning expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 3-digit invoice number
2. Convert "Month DD, YYYY" to YYYY-MM-DD
3. Use "Total" or "Account Balance" as amount
4. Monthly service with weekly entries
5. Note service dates for each visit`,

  'Dental & Medical Staffing, Inc': `You are parsing invoices from Dental & Medical Staffing, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Dental & Medical Staffing, Inc
- Also appears as: Dental & Medical Staffing, Inc.
- Address: 410 NE 181st Ave, Portland, OR 97230
- Phone: OR 503-618-8367, Toll free 1-800-683-0855
- Fax: 503-492-2545
- Fed ID: 93-1204198
- State ID: 0887802-2
- THIS IS A DENTAL TEMP STAFFING AGENCY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Dental & Medical Staffing, Inc.                           Invoice           │
│ 410 NE 181st Ave                                                            │
│ Portland, OR 97230                           DATE          INVOICE #        │
│ OR 503-618-8367 Fax 503-492-2545             9/8/2025      75629            │
│ Toll free 1-800-683-0855                                                    │
│ Fed ID 93-1204198 State ID 0887802-2                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Pacific Crest Smiles Eugene                                                 │
│ DBA Smiles Dental Eugene                                                    │
│ 2201 Willamette St                                                          │
│ Eugene, OR 97405                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                    P.O. NO.        TERMS                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ TYPE | NAME | DATE | LOCATION | HOURS | RATE | AMOUNT                       │
│ DA-Dental Asst. | Elesha Uffens | 8/28/2025 | Eugene | 9 | 47.00 | 423.00  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                           Total           $423.00           │
│ Thank you for choosing Dental & Medical Staffing, Inc.                      │
│ We appreciate your business!                                                │
│ www.dentalmedicalstaffinginc.com                                           │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "INVOICE #"
   - Format: 5-digit (e.g., 75629)

2. INVOICE DATE:
   - Position: Top right, "DATE"
   - Format: M/D/YYYY (e.g., 9/8/2025)

3. DUE DATE:
   - Position: "TERMS" field (may be blank)
   - Standard: Net 30

4. TOTAL AMOUNT:
   - Position: "Total" at bottom
   - Format: Dollar amount (e.g., $423.00)

5. SERVICE LOCATION:
   - Position: Bill-to section
   - Example: "Pacific Crest Smiles Eugene... Eugene" → Eugene
   - Also in LOCATION column of line items

6. STAFFING DETAILS:
   - TYPE: Position code (DA-Dental Asst., DH-Dental Hygienist, etc.)
   - NAME: Temp worker name
   - DATE: Shift date
   - LOCATION: Office location
   - HOURS: Hours worked
   - RATE: Hourly rate
   - AMOUNT: Line total

POSITION CODES:
- DA = Dental Assistant
- DH = Dental Hygienist
- DR = Dentist (rare)

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor
Location-Specific:
- General-Eugene: Direct Labor
Temp staffing - use Direct Labor expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 5-digit invoice number
2. Convert M/D/YYYY to YYYY-MM-DD
3. Use "Total" as amount
4. Track worker name, position, hours for reconciliation
5. LOCATION column indicates office`,

  'Patterson Dental Supply, Inc.': `You are parsing invoices from Patterson Dental Supply, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Patterson Dental Supply, Inc.
- Also appears as: Patterson Dental, Patterson
- THIS IS A MAJOR DENTAL SUPPLY DISTRIBUTOR (similar to Henry Schein)

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Two potential formats:

FORMAT A - SIMPLE:
Standard dental supply invoice with:
- Invoice Number (top)
- Invoice Date
- Ship-To and Bill-To addresses
- Product table: Product No., Description, Quantity, Unit, Unit Price, Amount
- Total at bottom

FORMAT B - DETAILED:
Detailed invoice with:
- Product #, Ordered, Shipped, Unit, Vendor, Vendor #, Description
- Unit Price, Amount, Tax columns

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header area, "Invoice #" or "Invoice Number"

2. INVOICE DATE:
   - Position: Header area

3. DUE DATE:
   - Look for: "Due Date" or Terms
   - Standard: Net 30

4. TOTAL AMOUNT:
   - Position: Bottom of invoice, "Total" or "Invoice Total"

5. SHIP-TO / LOCATION:
   - Position: Ship-To section
   - Critical for office identification

6. LINE ITEMS:
   - Dental supplies with product codes
   - May include shipping charges

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental supplies - ALWAYS use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Include shipping in total
5. Ship-To determines office location`,

  'Darby Dental Supply': `You are parsing invoices from Darby Dental Supply.

VENDOR IDENTIFICATION:
- Primary Name: Darby Dental Supply
- Also appears as: Darby
- THIS IS A DENTAL SUPPLY DISTRIBUTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Note: Some Darby invoices are scanned images without extractable text.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Format may include hyphens (e.g., 370122431-105546408)

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"
   - Standard: Net 30

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SHIP-TO / LOCATION:
   - Shows which office receives the order

6. LINE ITEMS:
   - Dental supplies with product codes

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental supplies - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number (may have hyphens)
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Some invoices may require OCR`,

  'Miracle Cleaners': `You are parsing invoices from Miracle Cleaners.

VENDOR IDENTIFICATION:
- Primary Name: Miracle Cleaners
- THIS IS A DRY CLEANING/LAUNDRY SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Note: Invoices may be scanned images without extractable text.

FIELD LOCATIONS:

1. INVOICE/RECEIPT NUMBER:
   - Look for: "Invoice #", "Receipt #"

2. DATE:
   - Look for: Date in header or filename (e.g., "10.15.25")

3. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE TYPE:
   - Dry cleaning
   - Laundry service

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
Dry cleaning - use Uniforms & Cleaning expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/receipt number
2. May need to parse date from filename
3. Use Total as amount
4. May require OCR for scanned images`,

  'Safeway': `You are parsing invoices from Safeway.

VENDOR IDENTIFICATION:
- Primary Name: Safeway
- Also appears as: Safeway Inc.
- THIS IS A GROCERY/RETAIL STORE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Retail receipt format - often scanned.

FIELD LOCATIONS:

1. RECEIPT/TRANSACTION NUMBER:
   - Look for: "Trans#", "Receipt #"

2. DATE:
   - Look for: Date/time on receipt

3. TOTAL AMOUNT:
   - Look for: "TOTAL", "Amount"

5. ITEMS PURCHASED:
   - Office supplies
   - Refreshments
   - Cleaning supplies

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses
Office supplies/refreshments - use Office Expenses
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract transaction/receipt number
2. Parse date from receipt
3. Use TOTAL as amount
4. May require OCR for scanned receipts`,

  'Ultradent Products, Inc.': `You are parsing invoices from Ultradent Products, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Ultradent Products, Inc.
- Also appears as: Ultradent
- THIS IS A DENTAL PRODUCTS MANUFACTURER

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Dental product invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Invoice Total"

5. SHIP-TO / LOCATION:
   - Shows which office receives order

6. PRODUCTS:
   - Dental products (whitening, bonding, etc.)
   - Product codes and descriptions

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental products - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Include shipping if present`,

  'Crystal Falls': `You are parsing invoices from Crystal Falls.

VENDOR IDENTIFICATION:
- Primary Name: Crystal Falls
- THIS IS A WATER/BEVERAGE SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Water delivery invoice format - often scanned.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Account #"

2. DATE:
   - Look for: "Invoice Date", "Delivery Date"

3. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. DELIVERY LOCATION:
   - Shows which office receives delivery

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses
Water service - use Office Expenses
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/account number
2. Parse date
3. Use Total as amount
4. May require OCR`,

  'Clark Public Utilities': `You are parsing invoices from Clark Public Utilities.

VENDOR IDENTIFICATION:
- Primary Name: Clark Public Utilities
- Also appears as: Clark County PUD
- THIS IS A UTILITY COMPANY - electricity, water

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Utility bill format - often scanned.

FIELD LOCATIONS:

1. ACCOUNT NUMBER:
   - Look for: "Account #", "Acct No."

2. BILL DATE:
   - Look for: "Statement Date", "Bill Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total Due", "Amount Due"

5. SERVICE ADDRESS:
   - Shows which office location

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53130 Utilities
Utility expense - use Utilities account
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract account number
2. Use bill/statement date
3. Use Total Due as amount
4. Service address determines office`,

  'CTR Services Northwest, LLC': `You are parsing invoices from CTR Services Northwest, LLC.

VENDOR IDENTIFICATION:
- Primary Name: CTR Services Northwest, LLC
- NOTE: This is the holding company for Pacific Crest Smiles
- THIS IS AN INTERNAL/RELATED ENTITY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Internal company invoice or inter-company billing.

SPECIAL HANDLING:
This vendor name is the parent company - may be:
1. Internal transfer
2. Inter-company billing
3. Rent or shared services

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #"

2. INVOICE DATE:
   - Look for: "Date"

3. TOTAL AMOUNT:
   - Look for: "Total"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
REVIEW REQUIRED: This is the parent company
May be rent, shared services, or internal transfer
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. FLAG FOR REVIEW - related party transaction
2. Check invoice details carefully
3. May require special GL handling`,

  'Pacific Office Automation': `You are parsing invoices from Pacific Office Automation.

VENDOR IDENTIFICATION:
- Primary Name: Pacific Office Automation
- Also appears as: POA
- THIS IS AN OFFICE EQUIPMENT VENDOR - copiers, printers

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Note: Invoices may be scanned images without extractable text.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE LOCATION:
   - Shows which office

6. CHARGES:
   - Equipment lease
   - Service/maintenance
   - Supplies (toner, paper)
   - Copy charges

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53400 Equipment:53410 Equipment Lease/Rental
Office equipment - use Equipment Lease/Rental
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. May require OCR`,

  'Henry Schein One': `You are parsing invoices from Henry Schein One.

VENDOR IDENTIFICATION:
- Primary Name: Henry Schein One
- Related to: Henry Schein, Inc. (but separate software division)
- THIS IS A DENTAL SOFTWARE COMPANY - Dentrix, practice management

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Software subscription/license invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SUBSCRIPTION DETAILS:
   - Software licenses
   - Support contracts
   - Cloud services

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
Dental software - use Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Note software/service period`,

  'UnitedHealthcare': `You are parsing invoices from UnitedHealthcare.

VENDOR IDENTIFICATION:
- Primary Name: UnitedHealthcare
- Also appears as: United Healthcare, UHC
- THIS IS A HEALTH INSURANCE COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Insurance premium statement format.

FIELD LOCATIONS:

1. STATEMENT NUMBER:
   - Look for: "Statement #", "Invoice #"

2. STATEMENT DATE:
   - Look for: "Statement Date", "Bill Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total Due", "Amount Due"

5. COVERAGE PERIOD:
   - Premium coverage dates

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor:51200 Employee Benefits:51210 Health Insurance
Health insurance premiums - use Employee Benefits
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract statement/invoice number
2. Use statement date
3. Use Total Due as amount
4. Note coverage period`,

  'Naomi Swinehart': `You are parsing invoices from Naomi Swinehart.

VENDOR IDENTIFICATION:
- Primary Name: Naomi Swinehart
- NOTE: This appears to be an individual contractor
- MAY BE: Consultant, temp worker, or other individual vendor

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Individual contractor invoice - format may vary.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #" (may not have one)

2. DATE:
   - Look for: Date on invoice

3. TOTAL AMOUNT:
   - Look for: "Total", amount

5. SERVICE DESCRIPTION:
   - Type of service performed

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or appropriate expense based on service type
Individual contractor - categorize by service
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract any invoice/reference number
2. Parse date
3. Use Total as amount
4. Note service type`,

  'FASTSIGNS': `You are parsing invoices from FASTSIGNS.

VENDOR IDENTIFICATION:
- Primary Name: FASTSIGNS
- Also appears as: FastSigns
- THIS IS A SIGNAGE/PRINTING COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Signage/printing invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Order #"

2. INVOICE DATE:
   - Look for: "Invoice Date", "Order Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. PRODUCTS/SERVICES:
   - Signs
   - Banners
   - Vehicle wraps
   - Printing services

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:54000 Other Expenses:54200 Advertising & Marketing:54210 Signage
Signage - use Advertising & Marketing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/order number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`
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
