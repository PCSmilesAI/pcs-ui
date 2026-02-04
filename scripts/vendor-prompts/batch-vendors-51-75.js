#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Berman Fink Van Horn P.C.': `You are parsing invoices from Berman Fink Van Horn P.C.

VENDOR IDENTIFICATION:
- Primary Name: Berman Fink Van Horn P.C.
- Also appears as: Berman Fink Van Horn
- Federal Tax ID: 58-1953139
- Payment link: https://secure.lawpay.com/pages/bfvlaw/operating
- THIS IS A LAW FIRM - trademark/legal services

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│           Federal Tax ID# 58-1953139                                        │
│           To pay by credit card, click on link below:                       │
│           https://secure.lawpay.com/pages/bfvlaw/operating                  │
│           All Major Credit Cards Accepted                                   │
│                                                                             │
│                                               [DATE - Month Day, Year]      │
│                                                                             │
│ Pacific Crest Smiles                         Invoice #:    148239           │
│ c/o Brit Young and Bridgeford Legal          Client #:      15190           │
│                                              Matter #:          1           │
├─────────────────────────────────────────────────────────────────────────────┤
│                        INVOICE SUMMARY                                      │
│ For professional services rendered through [Month Day, Year]:               │
│ RE: [Matter Description - e.g., Trademark]                                  │
│                                                                             │
│                Professional Services             $ 11,785.50                │
│                Less Professional Courtesy        $ -2,000.00                │
│                Net Professional Services          $ 9,785.50                │
│                Total Disbursements Advanced/Interest     $ .00              │
│                                                                             │
│                TOTAL THIS INVOICE                 $ 9,785.50                │
├─────────────────────────────────────────────────────────────────────────────┤
│ PROFESSIONAL SERVICES RENDERED                                              │
│ Date | Pers | Description of Services | Hours                               │
│ 7/17/25 | CMG | Confer with LCD regarding trademark... | .10               │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side, "Invoice #:"
   - Format: 6-digit (e.g., 148239)

2. INVOICE DATE:
   - Position: Top right area, full date line
   - Format: Month Day, Year (e.g., September 2, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - NOT explicitly shown
   - Standard legal terms: Net 30 from invoice date

4. TOTAL AMOUNT:
   - Position: "TOTAL THIS INVOICE" at bottom of summary
   - Format: $ with amount (e.g., $ 9,785.50)
   - NOTE: May include "Professional Courtesy" discounts

5. CLIENT/MATTER INFO:
   - Client #: 5-digit identifier
   - Matter #: Usually 1 (single matter)
   - RE: Describes the legal matter

6. SERVICE DETAILS:
   - Table with: Date | Pers | Description of Services | Hours
   - Personnel codes (CMG, LCD, etc.) identify attorneys
   - Hourly billing with detailed descriptions

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Professional Fees / Legal Expenses
This is LEGAL SERVICES - use appropriate professional fees account
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 6-digit invoice number
2. Convert "Month Day, Year" to YYYY-MM-DD
3. Use "TOTAL THIS INVOICE" as amount
4. Note: Courtesy discounts may be applied
5. Matter description (RE:) indicates service type`,

  'Passport to Languages Inc': `You are parsing invoices from Passport to Languages Inc.

VENDOR IDENTIFICATION:
- Primary Name: Passport to Languages Inc.
- Address: 3912 SW 43rd Ave, Portland, OR 97221-3709
- Phone: 503-297-2707, Fax: 503-297-1703
- Cost Code: 631-85902-769320
- Tax ID: 90-0738289
- THIS IS AN INTERPRETING SERVICE - medical/dental interpretation

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Passport to Languages Inc.    Pacific Crest Smiles Dental                   │
│ 3912 SW 43rd Ave              Attn: Accounts Payable         INVOICE DATE: 9/17/2025│
│ Portland, OR 97221-3709       16415 SE 15th St., Ste. 105    INVOICE NUMBER: 1206074│
│ TEL. 503-297-2707             Vancouver WA 98683             INVOICE STATUS: Unpaid│
│ FAX. 503-297-1703                                            INVOICE TOTAL: 45    │
│ COST CODE 631-85902-769320    PAYMENT DUE 30 DAYS UPON RECEIPT              │
│ TAX ID 90-0738289                                            TOTAL DUE: $45.00   │
├─────────────────────────────────────────────────────────────────────────────┤
│ APPT# | DATE | DEPARTMENT | INVOICE NOTES                                    │
│       | CLAIMANT NAME | DOB | OHP | MRN | LANGUAGE                          │
│       | INTERPRETER NAME | INTERP REG# | TIME IN | TIME OUT | MINS | TYPE | RATE | CHARGES│
├─────────────────────────────────────────────────────────────────────────────┤
│ 3801297 | 8-7-2025 | Pacific Crest Smiles Dental | Jenny 360-953-8135       │
│         | Jingxing Cao | | 9-7-1957 | | | Mandarin                          │
│         | Ping Shields-Sophia | 112656 | 3:00PM | 3:16PM | 16 | Certified | $45.00 | $45.00│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                   TOTAL: $45.00             │
│                                              TOTAL DUE: $45.00              │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "INVOICE NUMBER:"
   - Format: 7-digit (e.g., 1206074)

2. INVOICE DATE:
   - Position: Top right, "INVOICE DATE:"
   - Format: M/DD/YYYY (e.g., 9/17/2025)

3. DUE DATE:
   - Position: Note "PAYMENT DUE 30 DAYS UPON RECEIPT"
   - Calculate: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: "TOTAL DUE:" at bottom right
   - Format: Dollar amount (e.g., $45.00)

5. SERVICE LOCATION:
   - Position: Bill-to address shows office
   - Example: "Pacific Crest Smiles Dental... Vancouver WA" → Columbia

6. APPOINTMENT DETAILS:
   - APPT#: Appointment number
   - DATE: Service date
   - CLAIMANT NAME: Patient name
   - LANGUAGE: Language interpreted
   - INTERPRETER NAME: Interpreter used
   - TIME IN/OUT: Service times
   - MINS: Duration in minutes

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services
Interpreting service - use Contract Services or Professional Services expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 7-digit invoice number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "TOTAL DUE" as amount
4. Note appointment and interpreter details
5. Language indicates service type (Mandarin, Spanish, etc.)`,

  'Pavloff Landscape': `You are parsing invoices from Pavloff Landscape.

VENDOR IDENTIFICATION:
- Primary Name: Pavloff Landscape
- Also appears as: Pavloff Landscaping
- Address: P.O. Box 28, Days Creek, OR 97429
- Email: donovon@pavlofflandscape.co
- Phone: +1 (541) 733-5153
- THIS IS A LANDSCAPING SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ INVOICE                                                                     │
│ Pavloff Landscape          donovon@pavlofflandscape.co                     │
│ P.O. Box 28                +1 (541) 733-5153                               │
│ Days Creek, OR 97429                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill to                                Ship to                              │
│ Smiles Dental Riddle Oregon            Smiles Dental Riddle Oregon          │
│ 150 Main St                            Pacific Crest Smiles ATTN: AP        │
│ Riddle, OR 97469 USA                   1683 W Harvard Ave Roseburg, OR      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Invoice details                                                             │
│ Invoice no.: 464                                                            │
│ Terms: Net 15                                                               │
│ Invoice date: 09/09/2025                                                    │
│ Due date: 09/24/2025                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ # | Date | Description | Qty | Rate | Amount                                │
│ 1. | 08/12/2025 | Hourly | 1.5 | $40.00 | $60.00                           │
│ 2. | 08/12/2025 | Show up fee Riddle | 1 | $8.00 | $8.00                   │
│ 3. | 08/26/2025 | Hourly | 1 | $40.00 | $40.00                             │
│ 4. | 08/26/2025 | Show up fee Riddle | 1 | $8.00 | $8.00                   │
│ 5. | 08/26/2025 | Dump fee | 1 | $5.00 | $5.00                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                           Total        $121.00              │
│ ACH or checks, Thank you!                                                   │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: "Invoice no.:" in Invoice details section
   - Format: 3-digit (e.g., 464)

2. INVOICE DATE:
   - Position: "Invoice date:" in Invoice details
   - Format: MM/DD/YYYY (e.g., 09/09/2025)

3. DUE DATE:
   - Position: "Due date:" in Invoice details
   - Format: MM/DD/YYYY
   - NOTE: Terms are Net 15 (not 30)

4. TOTAL AMOUNT:
   - Position: "Total" at bottom
   - Format: Dollar amount (e.g., $121.00)

5. SERVICE LOCATION:
   - Position: Bill to / Ship to sections
   - Example: "Smiles Dental Riddle Oregon" → Riddle

6. LINE ITEMS:
   - Columns: # | Date | Description | Qty | Rate | Amount
   - Common charges: Hourly, Show up fee, Dump fee
   - Hourly rate: $40.00

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services

Location-Specific:
- General-Riddle: 53361 Contract Services (3 historical occurrences)

Landscaping service - use Contract Services expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 3-digit invoice number
2. Use MM/DD/YYYY date format
3. Use "Total" as amount
4. NOTE: Terms are NET 15 DAYS
5. Location in "Bill to" name (Riddle)`,

  'Sierra Springs': `You are parsing invoices from Sierra Springs.

VENDOR IDENTIFICATION:
- Primary Name: Sierra Springs
- Phone: 1-800-4-WATERS (1-800-492-8377)
- Website: www.SierraSprings.com
- Remit to: PO BOX 660579, DALLAS, TX 75266-0579
- Parent: Primo Brands
- THIS IS A BOTTLED WATER/BEVERAGE DELIVERY SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ 1-800-4-WATERS              www.SierraSprings.com                          │
│                                                                             │
│ Customer Account#: 297827414636642                                          │
│ SMILES DENTAL                           Invoice Date: 08-19-25              │
│ See Account Summary Details             Invoice #: 14636642 081925          │
│                                         Purchase Order #: See Details Below │
├─────────────────────────────────────────────────────────────────────────────┤
│ Date | Transaction # | Details | Qty. | Each | Amount | Date                │
│                      | Previous Balance |      |      | 4,863.08            │
│ 07-22-25            | Payment - Thank You |    |      | -567.82             │
│ 07-22-25            | Payment - Thank You |    |      | -609.69             │
│ 07-22-25            | Payment - Thank You |    |      | -924.75             │
│                      | Remaining Balance |      |      | 2,760.82            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Previous Balance | Payment | Total New Charges | Pay This Amount           │
│ $4,863.08        | $2,102.26 | $747.58         | $3,508.40                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Customer Account#: 297827414636642                                          │
│ Due By: Upon Receipt                                                        │
│ Late Fees May Apply After: 09-11-25                                        │
│ Total Amount Due: $3,508.40                                                │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: "Invoice #:" in header
   - Format: [AccountRef] [MMDDYY] (e.g., 14636642 081925)

2. INVOICE DATE:
   - Position: "Invoice Date:" in header
   - Format: MM-DD-YY (e.g., 08-19-25)
   - CONVERT TO YYYY-MM-DD (2025-08-19)

3. DUE DATE:
   - Position: "Due By:" at bottom
   - Often: "Upon Receipt"
   - Late fee date indicates deadline

4. TOTAL AMOUNT:
   - Position: "Total Amount Due:" OR "Pay This Amount"
   - Format: Dollar amount (e.g., $3,508.40)
   - NOTE: May include previous balance

5. CUSTOMER ACCOUNT:
   - Position: "Customer Account#:" at top
   - Format: Long numeric (e.g., 297827414636642)

6. SERVICE LOCATION:
   - Position: Bill-to name/address
   - Shows: SMILES DENTAL + address

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses

Water/beverage service - use Office Expenses
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number (may have space in middle)
2. Convert MM-DD-YY to YYYY-MM-DD
3. Use "Total Amount Due" as amount
4. May include previous balance - check for current charges only
5. Due: Upon Receipt (immediate)`,

  'Industrial Source': `You are parsing invoices from Industrial Source.

VENDOR IDENTIFICATION:
- Primary Name: Industrial Source
- Also known as: Industrial Source Roseburg, National Extinguisher Service
- Address: PO Box 7577, Springfield OR 97475
- Phone: (541) 242-6122
- Fax: (541) 242-6167
- THIS IS A MEDICAL GAS SUPPLIER - N2O, O2 cylinders

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORIGINAL INVOICE                                     │
│                                         INVOICE DATE: 10/29/25              │
│                                         ACCOUNT NUMBER: 2845                │
│                                         INVOICE NUMBER: 0002491493          │
├─────────────────────────────────────────────────────────────────────────────┤
│ INDUSTRIAL SOURCE ROSEBURG              PLEASE MAKE CHECKS PAYABLE TO       │
│ NATIONAL EXTINGUISHER SERVICE           INDUSTRIAL SOURCE                   │
│ ROSEBURG OR 97471                       PO Box 7577                         │
│ (541) 236-2812                          SPRINGFIELD OR 97475                │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILL TO:                         SHIP TO:                                   │
│ SMILES DENTAL                    SMILES DENTAL                              │
│ 10013 NE HAZEL DELL AVE #501     150 MAIN ST                               │
│ VANCOUVER WA 98685               RIDDLE OR 97469                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ ORDER #: 0003020047-00    TERMS: NET 30    BRN: 000007                      │
│ ORDER DATE: 10/27/25      SHIP VIA: ROUTE  SLS: 000700                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ ITEM | QTY SHIP'D | QTY B/O | CYL SHP'D | CYL RET'D | DESCRIPTION | UOM | UNIT PRICE | AMOUNT│
│ 30200471029N2OPUSPE | 3 | 0 | 3 | 3 | MEDICAL NITROUS OXIDE PRIVATE E | CYL | 89.00 | 267.00│
│     Lot/Tag details...                                                      │
│ 30200471029OX PUSPE ALUM | 4 | 0 | 4 | 4 | MEDICAL OXYGEN ALUM PRIVATE E | CYL | 37.00 | 148.00│
│ RF2HAZ10 | 1 | | | | HAZMAT/HANDLING FEE | EACH | 12.95 | 12.95            │
│ RF3FUELSUR | 1 | | | | FUEL COST SURCHARGE ROUTE | EACH | 6.73 | 6.73      │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right header, "INVOICE NUMBER"
   - Format: 10-digit (e.g., 0002491493)

2. INVOICE DATE:
   - Position: Top right header, "INVOICE DATE"
   - Format: MM/DD/YY (e.g., 10/29/25)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: Terms row, "TERMS"
   - Shows: "NET 30"
   - Calculate: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: Bottom right of line items
   - Sum of all line amounts

5. ACCOUNT NUMBER:
   - Position: Top right header
   - Format: 4-digit (e.g., 2845)

6. SHIP-TO / LOCATION:
   - Position: "SHIP TO:" section
   - Example: "150 MAIN ST RIDDLE OR" → Riddle

7. LINE ITEMS:
   - Medical gas cylinders with:
     * Qty shipped/returned
     * Cylinder tag IDs
     * Lot numbers
   - Additional fees: HAZMAT, FUEL SURCHARGE

GAS TYPES:
- N2OPUSPE: MEDICAL NITROUS OXIDE PRIVATE E
- OX PUSPE ALUM: MEDICAL OXYGEN ALUM PRIVATE E

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases

Medical gas supplier - use Medical Gases expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 10-digit invoice number
2. Convert MM/DD/YY to YYYY-MM-DD
3. Sum all line items for total
4. Include HAZMAT and FUEL fees
5. Cylinder tracking with tag IDs`,

  'Stericycle': `You are parsing invoices from Stericycle, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Stericycle, Inc.
- Tax ID: 36-3640402
- Customer Service: 1-866-783-7422
- Website: www.stericycle.com, MyStericycle.com
- THIS IS A MEDICAL WASTE DISPOSAL SERVICE - regulated medical waste, sharps

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                           TAX ID: 36-3640402            Page 1 of 2         │
│                           Customer No. (Payer): 1000830609                  │
│                           Invoice No.: 8012406233                           │
│                           Invoice Date: 10-24-2025                          │
│                           Due Date: 11-23-2025                              │
│                           Total Invoice Charges: $284.65                    │
│                           Payment Terms: Net due in 30 days                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ SMILES DENTAL                                                               │
│ Accounts Payable                                                            │
│ 1683 W HARVARD AVE                                                          │
│ ROSEBURG, OR 97471-2812                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Site#: 3000987967 PACIFIC CREST SMILES 1683 W HARVARD AVE ROSEBURG OR       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Service Date | Customer PO | Proof of Service | Service Description | Qty | UOM | Unit Price | Surcharges | Subtotal│
│ 10-13-2025 | | 8179409876 | REGULATED MEDICAL WASTE SERVICE | | | | |    │
│            | | | AUTOCLAVE 43 GAL TUB W/HINGED LID REUSABLE | 1 | EA | $139.24 | | $139.24│
│            | | | Manifest: HS0010281287 | | | | |                          │
│            | | | Stop Charge | | | | | $118.35                             │
│            | | | Record Retention per Stop | | | | $6.96 |                 │
│            | | | Energy Surcharge | | | | $4.00 |                          │
│            | | | Environmental / Regulatory Fee | | | | $16.10 |           │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice No."
   - Format: 10-digit (e.g., 8012406233)

2. INVOICE DATE:
   - Position: Top right, "Invoice Date"
   - Format: MM-DD-YYYY (e.g., 10-24-2025)

3. DUE DATE:
   - Position: Top right, "Due Date"
   - Format: MM-DD-YYYY (e.g., 11-23-2025)

4. TOTAL AMOUNT:
   - Position: "Total Invoice Charges:" in header
   - Format: Dollar amount (e.g., $284.65)

5. CUSTOMER NUMBER:
   - Position: "Customer No. (Payer)"
   - Format: 10-digit (e.g., 1000830609)

6. SITE / LOCATION:
   - Position: "Site#:" line
   - Shows: Site number + office name + address
   - Example: "3000987967 PACIFIC CREST SMILES... ROSEBURG OR" → Roseburg

7. SERVICE DETAILS:
   - Service Date
   - Service Description (REGULATED MEDICAL WASTE, etc.)
   - Manifest number for waste tracking
   - Surcharges: Stop Charge, Record Retention, Energy, Environmental

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53225 Hazardous Disposal

Medical waste disposal - use Hazardous Disposal expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 10-digit invoice number
2. Use MM-DD-YYYY date format (already standard)
3. Use "Total Invoice Charges" as amount
4. Note: May show "Scheduled for auto-pay, do not pay"
5. Site# indicates service location`,

  'Pure Clean LLC': `You are parsing invoices from Pure Clean LLC.

VENDOR IDENTIFICATION:
- Primary Name: Pure Clean LLC
- Remit to: 119 Green Lane, Eugene, OR 97401
- THIS IS A CLEANING/JANITORIAL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Pure Clean LLC                                    INVOICE                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILL TO:                                 NUMBER:        INV113              │
│ Pacific Crest Smiles                     DATE:          Nov 16, 2025        │
│ 175 Park St Lebanon, OR 97355            DUE DATE:      On receipt          │
│ 541-948-4388                                                                │
│ ginnyd@pacificcrestsmiles.com                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Description | Quantity | Unit price | Amount                                │
│ Weekly business clean - Medical office | 1 | $150.00 | $150.00             │
│ Weekly clean - 11/14/2025                                                   │
│ Late fee | 1 | $20.00 | $20.00                                             │
│ Inv 110                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                          SUBTOTAL:     $170.00              │
│                                          TOTAL:        $170.00              │
│                                          PAID:         $0.00                │
│                                          BALANCE DUE   $170.00              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Comments: Send payment to:                                                  │
│ 119 Green Lane, Eugene, OR 97401                                           │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side, "NUMBER:"
   - Format: INVXXX (e.g., INV113)

2. INVOICE DATE:
   - Position: Right side, "DATE:"
   - Format: Month DD, YYYY (e.g., Nov 16, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: "DUE DATE:"
   - Often: "On receipt" (immediate payment)

4. TOTAL AMOUNT:
   - Position: "BALANCE DUE" at bottom
   - Format: Dollar amount (e.g., $170.00)

5. SERVICE LOCATION:
   - Position: BILL TO address
   - Example: "175 Park St Lebanon, OR" → Lebanon

6. LINE ITEMS:
   - Description | Quantity | Unit price | Amount
   - Common: Weekly business clean - Medical office
   - May include: Late fees for past due invoices

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning

Cleaning/janitorial service - use Uniforms & Cleaning expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract INV-prefixed invoice number
2. Convert "Month DD, YYYY" to YYYY-MM-DD
3. Use "BALANCE DUE" as total (may include late fees)
4. Due: On receipt (immediate)
5. Weekly recurring service`,

  'Oral BioTech, LLC': `You are parsing invoices from Oral BioTech, LLC.

VENDOR IDENTIFICATION:
- Primary Name: Oral BioTech, LLC
- Also appears as: Oral Biotech, Llc
- Address: 321 1st Avenue NE, Suite 3A, Albany OR 97321
- Phone: 866.928.4445
- Website: www.carifree.com
- THIS IS A DENTAL PRODUCTS COMPANY - CariFree products, oral care

INVOICE FORMAT - CASH SALE (PREPAID):
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Oral BioTech, LLC                            Cash Sale                      │
│ 321 1st Avenue NE                                                           │
│ Suite 3A                                     Date: 9/17/2025                │
│ Albany OR 97321                              Sale #: 261534                 │
│ 866.928.4445                                 Payment Method: American Express│
│                                              Ship Via: UPS Ground           │
│                                              Tracking Info: 1ZR574490398508644│
│                                              Credit Card #: ***********1126 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill To                              Ship To                                │
│ ATTN: Accounts Payable               Smiles Dental                          │
│ Pacific Crest Smiles                 2201 Willamette Street, Suite A        │
│ 1683 W Harvard Ave                   Eugene OR 97405                        │
│ Suite 501                                                                   │
│ Roseburg OR 97471                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Item | Qty | Description | Rate | Amount | Price Level | Lot#               │
│ D-FGM5012 | 2 | CariFree PRO Gel 5000, MINT, 12-Pack | 168.00 | 336.00 | Base Price│
│ UPS Ground | 1 | | 0.00 | 0.00 |                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                              Total    $336.00               │
│                                              PAID IN FULL                   │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE/SALE NUMBER:
   - Position: "Sale #:" in header
   - Format: 6-digit (e.g., 261534)

2. INVOICE DATE:
   - Position: "Date:" in header
   - Format: M/DD/YYYY (e.g., 9/17/2025)

3. DUE DATE:
   - N/A - "Cash Sale" means prepaid
   - Shows "PAID IN FULL"

4. TOTAL AMOUNT:
   - Position: "Total" near bottom
   - Format: Dollar amount (e.g., $336.00)
   - NOTE: Shows "PAID IN FULL" if prepaid

5. SHIP-TO / LOCATION:
   - Position: "Ship To" section
   - Example: "2201 Willamette Street... Eugene OR" → Eugene

6. PAYMENT INFO:
   - Payment Method (American Express, etc.)
   - Credit Card # (masked)
   - Tracking Info for shipment

7. LINE ITEMS:
   - Item code | Qty | Description | Rate | Amount
   - Common products: CariFree PRO Gel, oral care products

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Dental products - use Dental Supplies Inventory
NOTE: "Cash Sale" documents are prepaid - may not need AP processing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 6-digit sale number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "Total" as amount
4. Note: "PAID IN FULL" means prepaid
5. Ship-to location determines office`,

  'Ondiem': `You are parsing invoices from onDiem (Gig Forces Inc.).

VENDOR IDENTIFICATION:
- Primary Name: onDiem
- Legal/Payment Entity: Gig Forces Inc.
- Address: P.O. Box 340749, Tampa, FL 33694
- Phone: (855) 680-0701
- Support: support@onDiem.com
- THIS IS A TEMP STAFFING SERVICE - dental temp workers

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                              Invoice # 1c092f42358f         │
│                                              Temp Shift Date Aug 26, 2025   │
│ onDiem                                       Date of issue Aug 28, 2025     │
│ P.O. Box 340749                              Date due Oct 9, 2025           │
│ Tampa, FL 33694                                                             │
│ Phone: (855) 680-0701                        Payment To: Gig Forces Inc.    │
│                                              P.O. Box 340749                │
│ Bill To:                                     Tampa, FL 33694                │
│ Smiles Dental - Milwaukie, OR                ACH Bank name: Wells Fargo     │
│ 11084 SE Oak St, Milwaukie, OR, 97222        ACH Routing #: 121000248       │
│ (503)659-9667                                ACH Account #: 40630214603387067│
│ corwinab@pacificcrestsmiles.com                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           [Pay Invoice Button]                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Description | Qty | Unit price | Amount                                     │
│ Temp Employee: Beatriz Diaz-Acosta                                          │
│ Position: dental assistant                                                  │
│ Shift Date: August 26                                                       │
│ Total Hours Worked: 8.67                              1 | $251.43 | $251.43 │
│ Hourly Rate: 29                                                             │
│ Auto-Approved On: Aug 28, 2025                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Employee wages: Worked hours 8.67/h * $29/h          $251.43                │
│ Employer Labor Investment Costs:                                            │
│   Social Security Tax @ 6.2%                         $15.59                 │
│   Medicare Tax @ 1.45%                               $3.65                  │
│   FUTA @ 6.0%                                        $15.09                 │
│   SUTA @ 1.3%                                        $3.27                  │
│   Workers Comp Insurance @ 0.38%                     $0.96                  │
│                                                                             │
│ Employee wages:                                      $251.43                │
│ Employee Labor Investment Costs:                     $38.56                 │
│ Volume-based Service Charge:                         $62.84                 │
│                                                                             │
│ Subtotal:                                            $352.83                │
│ Processing fee:                                      $5.00*                 │
│ *Credit/debit cards: $10.85 (2.9% + $0.30)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "Invoice #"
   - Format: Alphanumeric hash (e.g., 1c092f42358f)

2. INVOICE DATE:
   - Position: "Date of issue"
   - Format: Month DD, YYYY (e.g., Aug 28, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: "Date due"
   - Format: Month DD, YYYY

4. TOTAL AMOUNT:
   - Position: "Subtotal:" near bottom
   - Add Processing fee if applicable
   - Format: Dollar amount

5. SERVICE LOCATION:
   - Position: "Bill To:" section
   - Example: "Smiles Dental - Milwaukie, OR" → Milwaukie

6. TEMP WORKER DETAILS:
   - Temp Employee name
   - Position (dental assistant, hygienist, etc.)
   - Shift Date
   - Hours Worked
   - Hourly Rate

7. COST BREAKDOWN:
   - Employee wages
   - Employer taxes (SS, Medicare, FUTA, SUTA)
   - Workers Comp
   - Service Charge
   - Processing fee

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor (for temp workers)
OR Contract Services for staffing agency fees

Temp staffing service - categorize based on position type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract alphanumeric invoice hash
2. Convert "Month DD, YYYY" to YYYY-MM-DD
3. Use Subtotal + Processing fee as total
4. Note: Payment to "Gig Forces Inc." not "onDiem"
5. Track shift dates and hours for reconciliation`,

  'Campbell Commercial Real Estate': `You are parsing invoices from Campbell Commercial Real Estate.

VENDOR IDENTIFICATION:
- Primary Name: Campbell Commercial Real Estate
- Address: P.O. Box 10066, Eugene, OR 97440
- Phone: 541-484-2214
- THIS IS A PROPERTY MANAGEMENT/REAL ESTATE service - property tax, insurance

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Campbell Commercial Real Estate                    INVOICE                  │
│ P.O. Box 10066                                     DATE: October 31, 2025   │
│ Eugene, OR 97440                                                            │
│ Phone 541-484-2214                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill to: CTR Services Northwest, LLC                                        │
│          2201 Willamette Street, Suite A                                    │
│          Eugene, OR 97405                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                        DESCRIPTION                           AMOUNT         │
│ 2025-2026 Property Tax      ($22,685.83 x 54%)              12,250.35      │
│ 2025-2026 Insurance         ($4,021.00 x 54%)                2,171.34      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                            TOTAL    $       14,421.69       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Make check payable to: Rambler Rose LLC                                     │
│ Mail payment to: Campbell Commercial Real Estate                            │
│                  PO Box 10066                                               │
│                  Eugene, OR 97440                                           │
│                                       THANK YOU                             │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - NOT explicitly shown
   - Use date as reference

2. INVOICE DATE:
   - Position: Top right, "DATE:"
   - Format: Month DD, YYYY (e.g., October 31, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - NOT explicitly shown
   - Standard: Net 30 from invoice date

4. TOTAL AMOUNT:
   - Position: "TOTAL" line
   - Format: $ with amount (e.g., $ 14,421.69)

5. BILL-TO ENTITY:
   - Position: "Bill to:" section
   - May be CTR Services Northwest, LLC (parent company)

6. PROPERTY LOCATION:
   - Derived from bill-to address
   - Example: "2201 Willamette Street... Eugene, OR" → Eugene

7. CHARGE BREAKDOWN:
   - Property Tax: Base amount × percentage
   - Insurance: Base amount × percentage
   - Percentage indicates share (e.g., 54%)

8. PAYEE:
   - NOTE: Check payable to "Rambler Rose LLC" (different from invoice sender)

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
For Property Tax: Appropriate property tax expense account
For Insurance: Property/liability insurance expense account

Location: General-Eugene (based on property address)
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Date may serve as invoice reference if no number
2. Convert "Month DD, YYYY" to YYYY-MM-DD
3. Use "TOTAL" as amount
4. Note: Payee may be different entity (Rambler Rose LLC)
5. Split Property Tax and Insurance as separate expense types`,

  'OnDeim/Gig Forces Inc': `You are parsing invoices from onDiem (Gig Forces Inc.).

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "Ondiem" - normalize vendor name.

- Primary Name: onDiem
- Also appears as: OnDeim/Gig Forces Inc, Ondiem
- Payment Entity: Gig Forces Inc.
- Normalize to: "Ondiem"

See "Ondiem" for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
Temp staffing service - use Direct Labor or Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "Ondiem"
2. Follow Ondiem format`
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
