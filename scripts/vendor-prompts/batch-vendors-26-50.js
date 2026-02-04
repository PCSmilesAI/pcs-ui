#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Republic Services': `You are parsing invoices from Republic Services.

VENDOR IDENTIFICATION:
- Primary Name: Republic Services
- Also appears as: Republic Services #450, Albany-Lebanon Sanitation
- Address: P.O. Box 1929, Albany OR 97321
- Customer Service: (541) 928-2551
- Pay By Phone: (877) 692-9729
- THIS IS A WASTE DISPOSAL/SANITATION SERVICE - trash collection, recycling

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ P.O. Box 1929                         Account Number      3-0450-0120691    │
│ Albany OR 97321                       Invoice Number      0450-004311513    │
│                                       Invoice Date        May 31, 2025      │
│ Customer Service: (541) 928-2551                                            │
│                                       Previous Balance           $0.00      │
│                                       Payments/Adjustments       $0.00      │
│                                       Current Invoice Charges  $146.36      │
│                                                                             │
│                                       Total Amount Due   Payment Due Date   │
│                                          $146.36         June 20, 2025      │
├─────────────────────────────────────────────────────────────────────────────┤
│ CURRENT INVOICE CHARGES                                                     │
│ Description                   Reference    Quantity  Unit Price   Amount    │
│ Pacific Crest Smiles 175 Park St CSA S016427529                             │
│ Lebanon, OR Contract: 5 (C5)                                                │
│ 2 Trash Cart 95/96 Gal, 2 Lifts Per Week                                    │
│ Recycling Processing Surcharge 05/12-06/30           $4.00        $3.32     │
│ 95/96 Gallon Cart Service 05/12-06/30    2.0000     $86.30      $143.04     │
├─────────────────────────────────────────────────────────────────────────────┤
│                               Total Amount Due                   $146.36    │
│                               Payment Due Date            June 20, 2025     │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice Number"
   - Format: XXXX-XXXXXXXXX (e.g., 0450-004311513)

2. INVOICE DATE:
   - Position: Top right, "Invoice Date"
   - Format: Month Day, Year (e.g., May 31, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: "Payment Due Date"
   - Format: Month Day, Year (e.g., June 20, 2025)

4. TOTAL AMOUNT:
   - Position: "Total Amount Due"
   - Format: Dollar amount (e.g., $146.36)

5. ACCOUNT NUMBER:
   - Position: Top right, "Account Number"
   - Format: X-XXXX-XXXXXXX (e.g., 3-0450-0120691)

6. SERVICE LOCATION:
   - Position: In "CURRENT INVOICE CHARGES" section
   - Shows: Office name, address, contract details
   - Example: "Pacific Crest Smiles 175 Park St... Lebanon, OR"

SERVICE TYPES:
- Trash Cart Service (various sizes)
- Recycling Processing Surcharge
- Cart rentals

GL ACCOUNT GUIDANCE (Based on 9+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53225 Hazardous Disposal
(or appropriate waste disposal account)

CRITICAL: Waste/sanitation service - use appropriate disposal expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract hyphenated invoice number
2. Convert "Month Day, Year" to YYYY-MM-DD
3. Use "Total Amount Due" as amount
4. Service location shows which office`,

  'Vyne Dental': `You are parsing invoices from Vyne Dental.

VENDOR IDENTIFICATION:
- Primary Name: Vyne Dental
- Address: 6510 Telecom Drive, Suite 300, Indianapolis, IN 46278
- Email: Billing@vynedental.com
- Phone: 1-800-782-5150, opt 3 then 1
- THIS IS A SOFTWARE/DENTAL TECHNOLOGY SERVICE - Trellis, patient intake software

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                             Invoice #NEA3947271             │
│ 6510 Telecom Drive, Suite 300                                               │
│ Indianapolis, IN 46278                               8/8/2025               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill To                    Ship To                              TOTAL       │
│ Ryan Macomb                Pacific Crest Smiles Dental                      │
│ Pacific Crest Smiles       Roseburg                                         │
│                            1683 West Harvard Avenue            $249.00      │
│                            Roseburg OR 97471                                │
│                                               Due Date: 8/8/2025            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Customer ID    Terms           Due Date    PO #                             │
│ PT123719       Due on receipt  8/8/2025                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Item           Description       Qty   Service Start   Service End   Amount │
│ Trellis Intake Trellis Intake    1     8/9/2025        9/8/2025     249.00 │
│ w/Image Sync   w/Image Sync                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                          Subtotal        $249.00            │
│                                          Tax              $0.00             │
│                                          Total          $249.00             │
│                                          Payments Applied $249.00           │
│                                          Amount Due        $0.00            │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice #"
   - Format: NEA####### (e.g., NEA3947271)

2. INVOICE DATE:
   - Position: Top right, below Invoice #
   - Format: M/D/YYYY (e.g., 8/8/2025)

3. DUE DATE:
   - Position: "Due Date" in header AND terms section
   - Terms: "Due on receipt"

4. TOTAL AMOUNT:
   - Position: "Total" in summary section
   - Check "Amount Due" - may be $0.00 if prepaid

5. SERVICE LOCATION:
   - Position: "Ship To" section
   - Shows: Office name and address

6. CUSTOMER ID:
   - Position: Terms section
   - Format: PTxxxxxx (e.g., PT123719)

SERVICE TYPES:
- Trellis Intake w/Image Sync (patient intake software)
- Service periods shown

GL ACCOUNT GUIDANCE (Based on 10+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53330 IT Expenses:53334 Software

Software/technology subscription - use IT Expenses:Software
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract NEA-prefixed invoice number
2. Convert M/D/YYYY to YYYY-MM-DD
3. Use "Total" as amount (check if Amount Due is 0 = prepaid)
4. Service period dates for subscription tracking`,

  'AS & P Billing Services Corp': `You are parsing invoices from AS&P Billing Services Corp.

VENDOR IDENTIFICATION:
- Primary Name: AS&P Billing Services Corp.
- Also appears as: ASP Billing Services
- Address: P.O. Box 733746, Dallas, TX 75373
- Phone: 970-532-0292
- Email: billing@asapbillingservicescorp.com
- THIS IS A JANITORIAL/CLEANING SERVICE BILLING - bills on behalf of Jan-Pro franchisees

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ AS&P Billing Services Corp.                                                 │
│ P.O. Box 733746                              Date           Invoice #       │
│ Dallas, TX 75373                           10/1/2025          139566        │
│                                    Invoice                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill To                              Service Location                       │
│ Pacific Crest Smiles                 Pacific Crest Smiles - Columbia        │
│ ATTN: Accounts Payable               16415 SE 15th Street Unit 105          │
│ 1683 W Harvard Ave                   Vancouver, WA 98683                    │
│ Roseburg, OR 97471                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Phone #        Fax #         E-mail              PO No.   Terms      CBO    │
│ 970-532-0292   970-532-0376  billing@...                  Net 15 Days  535  │
├─────────────────────────────────────────────────────────────────────────────┤
│                 Janitorial Services                              Amount     │
│ Regular Janitorial Service from 10/01/2025 to 10/31/2025         272.04    │
│ 0605 Vancouver WA Sales Tax                                        0.00    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                          Total                   $272.04    │
│                                          Payments/Credits          $0.00    │
│                                          Balance Due             $272.04    │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice #"
   - Format: 6-digit (e.g., 139566)

2. INVOICE DATE:
   - Position: Top right, "Date"
   - Format: M/D/YYYY (e.g., 10/1/2025)

3. DUE DATE:
   - NOT explicit - use Terms: Net 15 Days
   - Calculate: Invoice Date + 15 days

4. TOTAL AMOUNT:
   - Position: "Balance Due" at bottom
   - Format: Dollar amount (e.g., $272.04)

5. SERVICE LOCATION:
   - Position: "Service Location" section
   - Shows: "Pacific Crest Smiles - [Location]"
   - Example: "Pacific Crest Smiles - Columbia"

6. CBO NUMBER:
   - Position: Terms row
   - Format: 3-digit (e.g., 535)

SERVICE TYPES:
- Regular Janitorial Service
- Service period shown (from/to dates)
- Sales tax if applicable

GL ACCOUNT GUIDANCE (Based on 11+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning

Janitorial/cleaning service - use Office Expenses or Uniforms & Cleaning
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 6-digit invoice number
2. Convert M/D/YYYY to YYYY-MM-DD
3. Use "Balance Due" as amount
4. Terms are NET 15 DAYS (not 30)
5. This bills on behalf of Jan-Pro franchisees`,

  'Trustworkz Inc': `You are parsing invoices from Trustworkz Inc.

VENDOR IDENTIFICATION:
- Primary Name: Trustworkz Inc
- Also appears as: TRUSTWORKZ INC
- THIS IS A MARKETING/WEB SERVICES COMPANY - website development, digital marketing

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Standard invoice format with marketing/web services.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Format: May include prefix like "082512346"
   - Check filename for invoice number

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. BILLING ENTITY:
   - Usually billed to marketing/corporate

6. SERVICE DETAILS:
   - Web development services
   - Marketing services
   - Project-based or retainer billing

GL ACCOUNT GUIDANCE (Based on 14+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 11000 Fixed Assets:11050 Intangible Assets (for development)
OR Marketing expense account

Class: Div-Marketing (6 historical occurrences)
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header or filename
2. Convert dates to YYYY-MM-DD
3. Review for project/marketing services`,

  'Method Procurement Technologies LLC': `You are parsing invoices from Method Procurement Technologies LLC.

VENDOR IDENTIFICATION:
- Primary Name: Method Procurement Technologies LLC
- Also appears as: Method Procurement Technologies Llc
- THIS IS A PROCUREMENT/SOFTWARE SERVICE - procurement management platform

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Standard SaaS/service invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Check filename pattern: "invoice_MMDDYYYY-HHMMSS"

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE DETAILS:
   - Subscription/platform fees
   - Service period

GL ACCOUNT GUIDANCE (Based on 14+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
Typically software/service expense - review for specific categorization
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Subscription-based service`,

  'Dental & Medical Staffing, Inc': `You are parsing invoices from Dental & Medical Staffing, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Dental & Medical Staffing, Inc
- Also appears as: Dental Medical Staffing
- THIS IS A STAFFING SERVICE - temporary dental/medical staff

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Staffing invoice with hours and rates.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Inv #"
   - Check filename: "Inv_XXXXX_from_Dental_Medical_Staffing"

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE LOCATION:
   - Which office used staffing services

6. STAFFING DETAILS:
   - Worker hours
   - Hourly rates
   - Position types

GL ACCOUNT GUIDANCE (Based on 13+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor:51200 Support Labor:51220 Other Direct Labor:51224 Other Direct Labor-Training & Continuing Education

Location: General-Salem (1 occurrence)
Staffing/labor expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header or filename
2. Convert dates to YYYY-MM-DD
3. Note staffing period and hours`,

  'Pacific Dental Services': `You are parsing invoices from Pacific Dental Services.

VENDOR IDENTIFICATION:
- Primary Name: Pacific Dental Services
- Also appears as: PDS
- THIS IS A DENTAL SERVICES/SUPPORT organization

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Service/support organization invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE DETAILS:
   - Support services
   - Management fees

GL ACCOUNT GUIDANCE (Based on 12+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
Review for specific service type categorization
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Review service descriptions`,

  'Artisan Communications': `You are parsing invoices from Artisan Communications.

VENDOR IDENTIFICATION:
- Primary Name: Artisan Communications
- NOTE: Different from "Artisan Dental" which is a dental lab
- THIS IS A COMMUNICATIONS/PHONE SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Communications/telecom invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE LOCATION:
   - Which office uses the phone service

6. SERVICE DETAILS:
   - Phone/telecom services
   - Usage charges

GL ACCOUNT GUIDANCE (Based on 11+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
Typically telecommunications/phone expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Communication/phone service`,

  'Comcast Business': `You are parsing invoices from Comcast Business.

VENDOR IDENTIFICATION:
- Primary Name: Comcast Business
- THIS IS AN INTERNET/TELECOM SERVICE - business internet, phone

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Utility-style telecom invoice.

FIELD LOCATIONS:

1. INVOICE/ACCOUNT NUMBER:
   - Look for: "Account Number", "Invoice Number"

2. BILLING DATE:
   - Look for: "Bill Date", "Statement Date"

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"

4. TOTAL AMOUNT:
   - Look for: "Total Due", "Amount Due"

5. SERVICE LOCATION:
   - Service address shows which office

6. SERVICE DETAILS:
   - Internet service
   - Phone service
   - Equipment fees

GL ACCOUNT GUIDANCE (Based on 10+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
Typically telecommunications/internet expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract account/invoice number
2. Use billing date for invoice date
3. Monthly recurring service`,

  'Rectangle Health': `You are parsing invoices from Rectangle Health.

VENDOR IDENTIFICATION:
- Primary Name: Rectangle Health
- Also appears as: Rectangle
- THIS IS A PAYMENT PROCESSING SERVICE - credit card processing, patient payments

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Payment processing/merchant services invoice.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice"
   - Format: INV###### (e.g., INV248337)
   - May include additional reference numbers

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"

3. DUE DATE:
   - Look for: "Due Date"

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"

5. SERVICE LOCATION:
   - May show multiple offices if consolidated billing

6. SERVICE DETAILS:
   - Processing fees
   - Equipment rentals
   - Service charges

GL ACCOUNT GUIDANCE (Based on 8+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
Typically bank fees or processing fees expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract INV-prefixed invoice number
2. Convert dates to YYYY-MM-DD
3. Payment processing service`,

  'darby': `You are parsing invoices from Darby Dental Supply.

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "Darby Dental Supply" - normalize vendor name.

- Primary Name: Darby Dental Supply, LLC
- Also appears as: Darby Dental, darby (lowercase), Darby
- Normalize to: "Darby Dental Supply"

See "Darby Dental Supply" for full parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental supplies - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "Darby Dental Supply"
2. Follow Darby Dental Supply format`,

  'Darby': `You are parsing invoices from Darby Dental Supply.

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "Darby Dental Supply" - normalize vendor name.

- Primary Name: Darby Dental Supply, LLC
- Also appears as: Darby Dental, darby, Darby (capitalized)
- Normalize to: "Darby Dental Supply"

See "Darby Dental Supply" for full parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental supplies - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "Darby Dental Supply"
2. Follow Darby Dental Supply format`,

  'TC Dental Laboratory, Inc.': `You are parsing invoices from TC Dental Laboratory, Inc.

VENDOR IDENTIFICATION:
- Primary Name: TC Dental Laboratory, Inc.
- Also appears as: TC Dental Lab, TC Dental, Tc Dental Laboratory, Inc.
- Address: 1000 NE 122nd Ave, Portland, OR 97230
- Phone: 1 (800) 926-5412, 503-254-1957
- Email: info@tcdentallab.com
- Website: www.tcdentallab.com
- THIS IS A DENTAL LAB - crowns, bridges, prosthetics

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ TC Dental Laboratory, Inc.                                                  │
│ 1000 NE 122nd ave              INVOICE                                      │
│ Portland, OR 97230                                                          │
│ 1 (800) 926-5412               Invoice Number:     252-487                  │
│ 503-254-1957                   Account #:          1883                     │
│                                Invoice Date:       5/20/2025                │
│                                Ship Date:          5/26/2025                │
│                                Due Date:           5/27/2025                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Invoice To:                                                                 │
│ Smiles Dental (Salem, OR)                                                   │
│ 2245 Mission Street, Suite 100                                              │
│ Salem, OR 97302                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Doctor:    Grant Smith                                                      │
│ Patient:   Linda Maisel                                                     │
│ ToothNumber: 5,28-31                                                        │
│ Shade:     5M2                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ ITEM DESCRIPTION             QUANTITY  UNIT PRICE  TOTAL                    │
│ D2740 Full Zirconia Crown    5.00      $89.00     $445.00                  │
│ Posterior                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ SUB TOTAL                              $445.00                              │
│ Thank you for your business!                                                │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side header, "Invoice Number:"
   - Format: XXX-XXX (e.g., 252-487, 251-608)
   - Also shown as "*XXX-XXX*" at top

2. INVOICE DATE:
   - Position: Right side header, "Invoice Date:"
   - Format: M/DD/YYYY (e.g., 5/20/2025)

3. DUE DATE:
   - Position: Right side header, "Due Date:"
   - Format: M/DD/YYYY (usually 1-2 days after ship date)

4. TOTAL AMOUNT:
   - Position: "SUB TOTAL" at bottom
   - Format: Dollar amount (e.g., $445.00)

5. OFFICE LOCATION:
   - Position: "Invoice To:" section
   - Shows: "Smiles Dental ([Location], OR)"
   - Example: "Smiles Dental (Salem, OR)" → Salem

6. DOCTOR NAME:
   - Position: "Doctor:" field
   - Important for lab work tracking

7. PATIENT NAME:
   - Position: "Patient:" field
   - Essential for case matching

8. TOOTH NUMBER:
   - Position: "ToothNumber:" field
   - May be single or multiple (e.g., "5,28-31")

9. SHADE:
   - Position: "Shade:" field
   - Dental shade code (e.g., 5M2, A2, A3)

10. LINE ITEMS:
    - Columns: ITEM DESCRIPTION | QUANTITY | UNIT PRICE | TOTAL
    - D-codes indicate dental procedure codes
    - Common: D2740 Full Zirconia Crown

GL ACCOUNT GUIDANCE (Based on 24+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees

Location-Specific Assignments:
- General-Salem: 52210 Dental Lab Fees (316 historical occurrences) - PRIMARY
- General-Roseburg: 52210 Dental Lab Fees (73 historical occurrences)
- All locations: 52210 Dental Lab Fees

CRITICAL: TC Dental is a DENTAL LAB - ALWAYS use "Dental Lab Fees"
Never use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract XXX-XXX format invoice number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "SUB TOTAL" as invoice amount
4. Extract patient and doctor names for tracking
5. Note tooth numbers and shade for case details`,

  'Tc Dental Laboratory, Inc.': `You are parsing invoices from TC Dental Laboratory, Inc.

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "TC Dental Laboratory, Inc." - normalize vendor name.

- Primary Name: TC Dental Laboratory, Inc.
- Also appears as: Tc Dental Laboratory, Inc. (case variation)
- Normalize to: "TC Dental Laboratory, Inc."

See "TC Dental Laboratory, Inc." for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
This is a DENTAL LAB - ALWAYS use "Dental Lab Fees"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "TC Dental Laboratory, Inc."
2. Follow TC Dental Laboratory format`,

  'TC Dental Lab': `You are parsing invoices from TC Dental Laboratory, Inc.

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "TC Dental Laboratory, Inc." - normalize vendor name.

- Primary Name: TC Dental Laboratory, Inc.
- Also appears as: TC Dental Lab (short form)
- Normalize to: "TC Dental Laboratory, Inc."

See "TC Dental Laboratory, Inc." for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
This is a DENTAL LAB - ALWAYS use "Dental Lab Fees"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "TC Dental Laboratory, Inc."
2. Follow TC Dental Laboratory format`,

  'Artisan Dental': `You are parsing invoices from Artisan Dental.

VENDOR IDENTIFICATION:
- Primary Name: Artisan Dental
- Also appears as: Artisan Dental Laboratory
- Account identifier: CN641911 (appears on invoices)
- Address: 2532 SE Hawthorne Blvd., Portland, OR 97214-3927
- Phone: 503/238-6006, 800/222-6721
- THIS IS A DENTAL LAB

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ PACIFIC CREST SMILES                                                        │
│ 2245 Mission SE St                                                          │
│ Suite 100                                                                   │
│ Salem OR 97302-1291                                                         │
│                                                                             │
│ CN641911                              INVOICE                               │
│ 2532 SE Hawthorne Blvd.                                                     │
│ Portland, OR 97214-3927                                                     │
│ 503 / 238-6006 - 800 / 222-6721                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ PATIENT NAME      ACCOUNT NO.  SHADE  INVOICE DATE  INVOICE NO.            │
│ LEE-DEVINE, ANTHONY            A2     07/17/2025    IN761720              │
├─────────────────────────────────────────────────────────────────────────────┤
│ QUANTITY  MOULD & SHADE  SERVICE                DWT & GR.  AMOUNT          │
│ 2.00      3039           Flipper with Wire 4-6              476.00         │
│ 1.00      3255           Strengthner Bar                     41.00         │
├─────────────────────────────────────────────────────────────────────────────┤
│ TOTAL                                                       517.00          │
│ LATE CHARGE: A penalty for late payment of 1-3/4% per month                │
│ (21% per annum) will be added to all accounts 30 days past due.            │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header row, "INVOICE NO." column
   - Format: INxxxxxx (e.g., IN761720, IN761993)

2. INVOICE DATE:
   - Position: Header row, "INVOICE DATE" column
   - Format: MM/DD/YYYY (e.g., 07/17/2025)

3. DUE DATE:
   - NOT explicitly shown
   - Late charge applies 30 days past due
   - Calculate: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: "TOTAL" at bottom
   - Format: Dollar amount without symbol (e.g., 517.00)

5. BILL-TO / OFFICE LOCATION:
   - Position: Top left corner
   - Shows: Office name, address
   - Example: "PACIFIC CREST SMILES, 2245 Mission SE St... Salem OR"

6. PATIENT NAME:
   - Position: Header row, "PATIENT NAME" column
   - Format: LASTNAME, FIRSTNAME (e.g., "LEE-DEVINE, ANTHONY")

7. ACCOUNT NUMBER:
   - Position: Header row, "ACCOUNT NO." column
   - Also CN641911 shown for vendor

8. SHADE:
   - Position: Header row, "SHADE" column
   - Dental shade code (e.g., A2)

9. LINE ITEMS:
   - Columns: QUANTITY | MOULD & SHADE | SERVICE | DWT & GR. | AMOUNT
   - Services include: Flipper with Wire, Strengthner Bar, Crowns

COMMON LAB SERVICES:
- Z360 ANTERIOR (anterior crowns)
- Flipper with Wire (partial dentures)
- Strengthner Bar
- Various crown types

GL ACCOUNT GUIDANCE (Based on 23+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees

Location-Specific Assignments:
- General-Salem: 52210 Dental Lab Fees (151 historical occurrences) - PRIMARY
- All locations: 52210 Dental Lab Fees

CRITICAL: Artisan Dental is a DENTAL LAB - ALWAYS use "Dental Lab Fees"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract IN-prefixed invoice number
2. Use MM/DD/YYYY date format
3. Use "TOTAL" as invoice amount
4. Patient name in LASTNAME, FIRSTNAME format
5. Extract office from bill-to address
6. Note late charge warning (30 days)`,

  'Artisan Dental Laboratory': `You are parsing invoices from Artisan Dental.

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "Artisan Dental" - normalize vendor name.

- Primary Name: Artisan Dental
- Also appears as: Artisan Dental Laboratory
- Normalize to: "Artisan Dental"

See "Artisan Dental" for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
This is a DENTAL LAB - ALWAYS use "Dental Lab Fees"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "Artisan Dental"
2. Follow Artisan Dental format`
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
