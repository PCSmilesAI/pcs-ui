#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'A-1 Professional Exterminating': `You are parsing invoices from A-1 Professional Exterminating.

VENDOR IDENTIFICATION:
- Primary Name: A-1 Professional Exterminating
- Also appears as: A1 Professional Exterminating
- Address: PO Box 26, Roseburg, OR 97470
- Phone: (541) 673-1404
- THIS IS A PEST CONTROL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ A-1 Professional Exterminating                       Invoice               │
│ PO Box 26                                 1683 W Harvard Ave                │
│ Roseburg, OR 97470                        INVOICE NO.      ACCOUNT NUMBER  │
│ (541) 673-1404                            25759            12434            │
│                                           INVOICE DATE     LICENSE          │
│                                           07/01/2025                        │
│ Pacific Crest Smiles                      DUE DATE (NET 0 TERMS)           │
│ 1683 W Harvard Ave                        Upon Receipt                      │
│ Roseburg, OR 97471                        AMOUNT DUE                        │
│                                           $40.00                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ ITEM                                      QUANTITY   PRICE    SUBTOTAL      │
│ Monthly Service                           1          $40.00   $40.00        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                           Subtotals         $40.00          │
│ Finance charge: 1.5% on unpaid after 30 days                               │
│                                           Taxes             $0.00           │
│                                           Invoice Total     $40.00          │
│                                           Amount Due        $40.00          │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side header, "INVOICE NO."
   - Format: 5-digit (e.g., 25759)

2. INVOICE DATE:
   - Position: Right side header, "INVOICE DATE"
   - Format: MM/DD/YYYY (e.g., 07/01/2025)

3. DUE DATE:
   - Position: "DUE DATE (NET 0 TERMS)"
   - Usually: "Upon Receipt"

4. TOTAL AMOUNT:
   - Position: "Amount Due" at bottom
   - Format: Dollar amount (e.g., $40.00)

5. ACCOUNT NUMBER:
   - Position: Right side header
   - Format: 5-digit (e.g., 12434)

6. SERVICE LOCATION:
   - Position: Bill-to address
   - Shows office address

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services
Pest control service - use Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 5-digit invoice number
2. Use MM/DD/YYYY date format
3. Use "Amount Due" as total
4. Due: Upon Receipt
5. Monthly recurring service`,

  'Signing Resources & Interpreters': `You are parsing invoices from Signing Resources & Interpreters.

VENDOR IDENTIFICATION:
- Primary Name: Signing Resources & Interpreters
- Address: PO Box 3067, Battle Ground, Washington 98604
- Phone: 877-512-2246 (Voice/Text/Fax)
- Email: Billing@signingresources.com
- THIS IS A SIGN LANGUAGE INTERPRETING SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                      Invoice                │
│ Bill To                                   Date            Invoice #         │
│ Columbia Smiles Family Dentistry          4/25/2025       12855             │
│ Attn: Accounts Payable                                                      │
│ 16415 SE 15th Street, Suite 105                                            │
│ Vancouver, Washington 98683                                                 │
│                                                                             │
│ Contract Number     Terms           Due Date                                │
│                     Due on receipt  5/15/2025                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Service Date | Job Description | Hours | Rate | Amount                      │
│ 4/14/2025   | Sign language interpreting services during business hours    │
│             | for A. Nusbaum                                                │
│             | Request ID: 141250 Time: 3:30 PM to 5:00 PM                  │
│             | Interpreter: Jill Hofstede                                    │
│             | 1 Interpreter x Total Time= 1:00 hr.                         │
│             | Requested By: Jenny                                           │
│             |                                          | 1 | 52.50 | 52.50 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                Total           $52.50       │
│ Payments accepted by checks, ACH, or credit cards                          │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice #"
   - Format: 5-digit (e.g., 12855)

2. INVOICE DATE:
   - Position: Top right, "Date"
   - Format: M/DD/YYYY (e.g., 4/25/2025)

3. DUE DATE:
   - Position: "Due Date" in header
   - Format: M/DD/YYYY
   - Terms: "Due on receipt"

4. TOTAL AMOUNT:
   - Position: "Total" at bottom
   - Format: Dollar amount (e.g., $52.50)

5. SERVICE LOCATION:
   - Position: "Bill To" section
   - Example: "Columbia Smiles Family Dentistry... Vancouver" → Columbia

6. SERVICE DETAILS:
   - Service Date
   - Job Description (interpreting details)
   - Request ID
   - Interpreter name
   - Hours worked
   - Patient/client name

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Professional Services expense
Sign language interpreting service
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 5-digit invoice number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "Total" as amount
4. Terms: Due on receipt
5. Track Request ID and interpreter name`,

  'Clipboard Health': `You are parsing invoices from Clipboard Health.

VENDOR IDENTIFICATION:
- Primary Name: Clipboard Health
- Also known as: TwoMagnets Inc. (for payment)
- Address: P.O. Box 103125, Pasadena, CA 91189-3125
- Email: billing@clipboardhealth.com
- THIS IS A HEALTHCARE STAFFING SERVICE - temp dental/medical workers

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                              INVOICE                        │
│                                              491928-1                       │
│ Clipboard Health                             Account #: 001Pf00000TXIRnIAP  │
│ P.O. Box 103125                              Date: 09/11/2025               │
│ Pasadena, CA 91189-3125                      Due Date: 09/12/2025           │
│                                              Billing Rep: Ryan Lumanlan     │
│ Bill To:                                     Tel: (559) 550-3532            │
│ ATTN: Jessica Weaver                         Period End Date: 09/10/2025    │
│ Pacific Crest Smiles Ridgefield              Period Start Date: 09/10/2025  │
│ 109 S 65th Ave                                                              │
│ Ridgefield, WA 98642                         Timesheet: View Timesheet      │
│                                              Balance Due: $602.70           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Summary Total                                                               │
│ Shift Type                           Total Hours        Amount              │
│ Dental Hygienist                     7.35               $602.70             │
│ Total                                7.35               $602.70             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Item                                 Quantity    Rate          Amount       │
│ 09/10/2025, DENTAL HYGIENIST Jennifer Moore, AM                             │
│ Charge Breakdown: Base Rate: 82      7.35        $82.00        $602.70      │
│ Shift Times: Shift start: 08:31 AM; Shift end: 04:57 PM                    │
│ Break start: 12:52 PM; Break end: 01:57 PM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                              Total:          $602.70        │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, standalone number
   - Format: XXXXXX-X (e.g., 491928-1)

2. INVOICE DATE:
   - Position: "Date:" in header
   - Format: MM/DD/YYYY (e.g., 09/11/2025)

3. DUE DATE:
   - Position: "Due Date:" in header
   - Format: MM/DD/YYYY
   - Usually very short term (next day)

4. TOTAL AMOUNT:
   - Position: "Balance Due:" in header AND "Total:" at bottom
   - Format: Dollar amount (e.g., $602.70)

5. ACCOUNT NUMBER:
   - Position: "Account #:" in header
   - Format: Long alphanumeric

6. SERVICE LOCATION:
   - Position: "Bill To:" section
   - Example: "Pacific Crest Smiles Ridgefield... Ridgefield, WA" → Ridgefield

7. BILLING PERIOD:
   - Period Start Date and Period End Date in header

8. STAFFING DETAILS:
   - Shift Type (Dental Hygienist, Dental Assistant, etc.)
   - Worker name
   - Total Hours
   - Hourly Rate
   - Shift times (start, end, break)

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor (for temp dental workers)
Healthcare staffing - categorize by position type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract XXXXXX-X format invoice number
2. Use MM/DD/YYYY date format
3. Use "Balance Due" as total
4. Note: Payment to "TwoMagnets Inc."
5. Short payment terms (often next day)
6. Track worker name and hours for reconciliation`,

  'Sunset Heating, Cooling, & Electrical': `You are parsing invoices from Sunset Heating, Cooling, & Electrical.

VENDOR IDENTIFICATION:
- Primary Name: Sunset Heating, Cooling, & Electrical
- Address: 2060 Vista Ave SE #150, Salem, OR 97302
- Phone: (503) 234-0611
- THIS IS AN HVAC/ELECTRICAL CONTRACTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Sunset Heating, Cooling, & Electrical        Invoice 335889502              │
│ 2060 Vista Ave SE #150, Salem, OR 97302      Invoice Date 9/22/2025         │
│ (503) 234-0611                               Completed Date 9/22/2025       │
│                                              Customer PO                     │
│ Refer family or friends and earn $50!!       Payment Term Due Upon Receipt  │
│                                              Due Date 9/22/2025             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Billing Address                              Job Address                     │
│ PC Smiles                                    PC Smiles                       │
│ 2245 Mission Street Southeast                2245 Mission Street Southeast   │
│ Salem, OR 97302 USA                          Salem, OR 97302 USA            │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Description of Work                                      │
│ Today I installed three new bathroom fans two in each of the patient        │
│ restrooms and one in the break room bathroom...                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Task # | Description | Quantity | Your Price | Your Total                   │
│ 1 | Install Basic Economy Bath Fan... | 3.00 | $1,251.00 | $3,753.00       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                    Potential Savings      $0.00             │
│                                    Sub-Total              $3,753.00         │
│                                    Tax                    $0.00             │
│                                    Total Due              $3,753.00         │
│                                    Payment                $3,753.00         │
│                                    Balance Due            $0.00             │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice XXXXXXXXX"
   - Format: 9-digit (e.g., 335889502)

2. INVOICE DATE:
   - Position: "Invoice Date" in header
   - Format: M/DD/YYYY (e.g., 9/22/2025)

3. DUE DATE:
   - Position: "Due Date" in header
   - Payment Term: "Due Upon Receipt"

4. TOTAL AMOUNT:
   - Position: "Total Due" in totals section
   - Check "Balance Due" for remaining amount
   - May show "Payment" if prepaid

5. JOB ADDRESS:
   - Position: "Job Address" section
   - Shows where work was performed

6. WORK DESCRIPTION:
   - Position: "Description of Work" section
   - Detailed narrative of services performed

7. LINE ITEMS:
   - Task # | Description | Quantity | Your Price | Your Total

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Repairs & Maintenance or Contract Services
HVAC/Electrical service - categorize by work type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 9-digit invoice number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "Total Due" or "Balance Due" as amount
4. Due Upon Receipt
5. Note: May show prepaid ("Payment" = "Total Due")`,

  'Brightview Electric': `You are parsing invoices from Brightview Electric.

VENDOR IDENTIFICATION:
- Primary Name: Brightview Electric
- Also appears as: Bright View Electric
- Address: 16983 SE Royer Rd, Damascus OR, 97089
- Phone: 360.566.3134
- CCB #: 159874
- THIS IS AN ELECTRICAL CONTRACTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Brightview Electric                                                         │
│ 16983 SE Royer Rd                                                          │
│ Damascus OR, 97089                              Date          Invoice#      │
│ PHONE: 360.566.3134                             10/17/2025    25102         │
│ CCB # 159874                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill TO                                         Project                     │
│ Pacific Crest Smiles                            Pacific Crest Smiles Milwaukie│
│ Alison Haynes                                   11084 SE Oak St             │
│ alih@pacificcrestsmiles.com                     Milwaukie, OR 97222        │
├─────────────────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                                                    AMOUNT       │
│ Final                                                                       │
│ 5 low voltage data drops, 5 low voltage data chases           $1,500.00    │
│ from toe to headwall                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                  TOTAL:        $1,500.00    │
├─────────────────────────────────────────────────────────────────────────────┤
│ after 15 days    after 45 days    after 75 days                            │
│ $1,522.50        $1,545.34        $1,568.52                                │
│ Please remit payment at your earliest convenience.                          │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice#"
   - Format: 5-digit (e.g., 25102)

2. INVOICE DATE:
   - Position: Top right, "Date"
   - Format: MM/DD/YYYY (e.g., 10/17/2025)

3. DUE DATE:
   - NOT explicit - shows late fee schedule
   - Late fees start after 15 days

4. TOTAL AMOUNT:
   - Position: "TOTAL:" at bottom of line items
   - Format: Dollar amount (e.g., $1,500.00)

5. PROJECT LOCATION:
   - Position: "Project" section
   - Shows: Office name and address
   - Example: "Pacific Crest Smiles Milwaukie... Milwaukie, OR" → Milwaukie

6. WORK DESCRIPTION:
   - Position: "DESCRIPTION" section
   - May show "Final" for completed project

7. LATE FEE SCHEDULE:
   - Shows escalating amounts after 15, 45, 75 days

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Repairs & Maintenance or Contract Services
Electrical contractor - categorize by work type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 5-digit invoice number
2. Use MM/DD/YYYY date format
3. Use "TOTAL" as amount
4. Due: Implied Net 15 (late fees after)
5. Project location indicates office`,

  'Glidewell Laboratories': `You are parsing invoices from Glidewell Laboratories.

VENDOR IDENTIFICATION:
- Primary Name: Glidewell Laboratories
- Also appears as: Glidewell
- THIS IS A DENTAL LAB - crowns, bridges, implants

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                    Patient Name: Holly Kingford             │
│                                    Order # 1132143170                       │
│                                    Invoice # 1132143170                     │
│                                    Doctor Name: Bernard Mcgraw              │
│                                    Doctor ID: 10-173604                     │
│                                    Receive Date: 2025-07-25                 │
│                                    Invoice Date: 2025-08-01                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                         INVOICE DETAILS                                     │
│ Product Description                  Tooth Number   Quantity   Cost         │
│ BruxZir Solid Zirconia Single       31             1          $ 109.00     │
│ STANDARD_OVERNIGHT                                  1          $ 9.00       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                    Discount Amount            $ 0.00        │
│                                    Tax Amount                 $ 0.00        │
│                                    Total Amount               $ 118.00      │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side, "Invoice #"
   - Format: 10-digit (e.g., 1132143170)
   - NOTE: Often same as Order #

2. INVOICE DATE:
   - Position: Right side, "Invoice Date:"
   - Format: YYYY-MM-DD (e.g., 2025-08-01)
   - Already in standard format

3. DUE DATE:
   - NOT explicitly shown
   - Standard lab terms: Net 30

4. TOTAL AMOUNT:
   - Position: "Total Amount" at bottom
   - Format: $ with amount (e.g., $ 118.00)

5. PATIENT NAME:
   - Position: Top right, "Patient Name:"
   - Important for case tracking

6. DOCTOR INFO:
   - Doctor Name
   - Doctor ID (e.g., 10-173604)

7. ORDER/RECEIVE DATES:
   - Order # (same as Invoice #)
   - Receive Date (when lab received case)

8. LINE ITEMS:
   - Product Description | Tooth Number | Quantity | Cost
   - Common: BruxZir Solid Zirconia (crowns)
   - Shipping: STANDARD_OVERNIGHT, etc.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
Dental lab - ALWAYS use Dental Lab Fees
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 10-digit invoice number
2. Date already in YYYY-MM-DD format
3. Use "Total Amount" as total
4. Track patient and doctor for case matching
5. Include shipping in total`,

  'Glidewell': `You are parsing invoices from Glidewell Laboratories.

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "Glidewell Laboratories" - normalize vendor name.
- Primary Name: Glidewell Laboratories
- Also appears as: Glidewell
- Normalize to: "Glidewell Laboratories"

See "Glidewell Laboratories" for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
Dental lab - use Dental Lab Fees
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "Glidewell Laboratories"
2. Follow Glidewell Laboratories format`,

  'Maxxeus': `You are parsing invoices from Maxxeus.

VENDOR IDENTIFICATION:
- Primary Name: Maxxeus
- THIS IS A DENTAL SUPPLIES VENDOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Standard dental supply invoice format - analyze actual invoice for specifics.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"
   - Or calculate from terms

4. TOTAL AMOUNT:
   - Look for: "Total", "Invoice Total", "Amount Due"
   - Position: Bottom of invoice

5. SHIP-TO / OFFICE LOCATION:
   - Look for: "Ship To", "Deliver To"
   - Shows dental office name and address

6. LINE ITEMS:
   - Product table with dental supplies

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Location: General-Roseburg (primary)
Dental supplies - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header
2. Convert dates to YYYY-MM-DD format
3. Use Total as invoice amount
4. Include shipping charges if present`,

  'Bio-Tek Medical': `You are parsing invoices from Bio-Tek Medical.

VENDOR IDENTIFICATION:
- Primary Name: Bio-Tek Medical
- Also appears as: Bio-Tek Medical, Inc.
- THIS IS A MEDICAL GAS SUPPLIER - N2O, O2

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Medical gas invoice format - similar to Linde/Airgas.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"

3. DUE DATE:
   - Look for: "Due Date"
   - Standard terms: Net 30

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. DELIVERY LOCATION:
   - Shows which office received gas delivery

6. GAS PRODUCTS:
   - Nitrous Oxide (N2O)
   - Oxygen (O2)
   - Cylinder rentals/returns

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases
Medical gas supplier - use Medical Gases expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Include cylinder rental/return tracking`
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
