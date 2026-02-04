#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Darby Dental Supply': `You are parsing invoices from Darby Dental Supply, LLC.

VENDOR IDENTIFICATION:
- Primary Name: Darby Dental Supply, LLC
- Also appears as: Darby Dental, darby, Darby
- THIS IS A DENTAL SUPPLIES DISTRIBUTOR (similar to Patterson Dental, Henry Schein)
- Major dental supply distributor - competitive pricing

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Darby Dental invoices typically follow standard dental supply distributor format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number", "Inv #"
   - Position: Top right header area
   - Format: Typically numeric with possible dashes

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date", "Inv Date"
   - Position: Near invoice number in header
   - Format: MM/DD/YYYY or MM-DD-YYYY

3. DUE DATE:
   - Look for: "Due Date", "Payment Due", or "Terms" (Net 30)
   - Position: Header area or bottom
   - Calculate if not shown: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Look for: "Total", "Invoice Total", "Amount Due", "Balance Due"
   - Position: Bottom right of invoice
   - Includes any shipping charges

5. SHIP-TO / OFFICE LOCATION:
   - Look for: "Ship To", "Deliver To"
   - Shows: Pacific Crest Smiles or Smiles Dental office
   - Extract location from office name or address

6. LINE ITEMS:
   - Product table with dental supplies
   - Columns typically: Item/SKU, Description, Qty, Unit Price, Extended Price
   - May include product codes/SKUs

OFFICE LOCATION MAPPING:
- Check Ship-To address for office location
- "Smiles Dental - [Location]" or "PC SMILES [Location]"
- Common locations: Roseburg, Eugene, Salem, Lebanon, Ridgefield, Columbia, Milwaukie, Riddle

GL ACCOUNT GUIDANCE (Based on 86+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Lebanon: 10210 Dental Supplies Inventory (7 historical occurrences)
- General-Roseburg: 10210 Dental Supplies Inventory (6 historical occurrences)
- All other locations: 10210 Dental Supplies Inventory

CRITICAL: This is a dental SUPPLIES vendor - ALWAYS use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header
2. Convert dates to YYYY-MM-DD format
3. Use Total/Amount Due as invoice amount (include shipping)
4. Extract location from Ship-To address
5. If document says "STATEMENT" - NOT an invoice, classify as Other Document`,

  'Dandy': `You are parsing invoices from Dandy (ZIMA INTERNATIONAL, INC.).

VENDOR IDENTIFICATION:
- Primary Name: Dandy
- Legal Name: ZIMA INTERNATIONAL, INC.
- Address: P.O. Box 738550, Dallas, TX 75373-8550
- Phone: (914) 402-9354
- Email: BillingandCollections@meetdandy.com
- THIS IS A DENTAL LAB - digital dentistry, aligners, night guards, retainers

INVOICE FORMAT - MODERN DIGITAL FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Invoice                                        │
│ Invoice number         #XXXXX-XXXX-XXX (e.g., #32257-9405-049)             │
│ Date of issue          [Month Day, Year]                                    │
│ Date due               [Month Day, Year]                                    │
│ Status                 Open                                                 │
│                                                                             │
│ ZIMA INTERNATIONAL, INC.                    [Office Name]                   │
│ P.O. Box 738550                             [email]                         │
│ Dallas, TX 75373-8550                                                       │
│                                                                             │
│ $XXX.XX USD due [Date]                      ✅ Powered by Dandy Hardware   │
│                                                                             │
│ Orders                    X                 $XXX.XX                         │
│ Sales Tax                                     $0.00                         │
│ Total balance                              $XXX.XX                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Lab Work                                                                    │
│ Date | Description | Doctor | Price | Tax | Total                          │
│ MM/DD/YY | [Patient Name] | [Doctor Name] | $XX.XX | $0.00 | $XX.XX        │
│          | [Lab item - e.g., Night Guard] | | $XX.XX                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Subtotal - Lab Work                        $XXX.XX | $0.00 | $XXX.XX       │
│                                                                             │
│ Invoice #XXXXX-XXXX-XXX - $XXX.XX USD due [Date]                           │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top of invoice, after "Invoice number"
   - Format: #XXXXX-XXXX-XXX (e.g., #32257-9405-049)
   - Extract without the # symbol

2. INVOICE DATE:
   - Position: After "Date of issue"
   - Format: "Month Day, Year" (e.g., "October 1, 2025")
   - CONVERT TO YYYY-MM-DD (e.g., 2025-10-01)

3. DUE DATE:
   - Position: After "Date due"
   - Format: "Month Day, Year"
   - Usually 7 days from invoice date

4. TOTAL AMOUNT:
   - Position: "Total balance" line
   - Also shown at top: "$XXX.XX USD due [Date]"
   - Format: Dollar amount (e.g., $804.00)

5. OFFICE LOCATION:
   - Position: Top right area, office name/email
   - Format: "Smiles Dental Services [Location]" or email like "salem@ravingsmiles.com"
   - Extract location from name or email prefix

6. LAB WORK TABLE:
   - Columns: Date | Description | Doctor | Price | Tax | Total
   - Patient names in Description column
   - Lab items indented under patient
   - Common items: Retainer, Night Guard, Aligner, Removable Model

COMMON LAB WORK TYPES:
- Retainer - Clear Retainer Essix
- Night Guard - Hard Soft 3 D Printed
- Aligner (aligners)
- Additional Arch
- Removable Model - Dual Full Arch / Single Full Arch

OFFICE LOCATION MAPPING:
- "Smiles Dental Services Salem" or "salem@ravingsmiles.com" → Salem
- "Smiles Dental Services Eugene" → Eugene
- Email prefix often indicates location

GL ACCOUNT GUIDANCE (Based on 74+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees

Location-Specific Assignments:
- General-Milwaukie: 52210 Dental Lab Fees (10 historical occurrences)
- General-Columbia: 52210 Dental Lab Fees (6 historical occurrences)
- All locations: 52210 Dental Lab Fees

CRITICAL: Dandy is a DENTAL LAB - ALWAYS use "Dental Lab Fees"
Never use "Dental Supplies Inventory" - that's for supply vendors
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number without # prefix
2. Convert "Month Day, Year" dates to YYYY-MM-DD
3. Use "Total balance" as invoice amount
4. Extract location from office name or email
5. Note: Dandy assumes cost of hardware taxes (shown in note)`,

  'Linde Gas & Equipment Inc': `You are parsing invoices from Linde Gas & Equipment Inc.

VENDOR IDENTIFICATION:
- Primary Name: Linde Gas & Equipment Inc.
- Also appears as: Linde Gas, Linde
- THIS IS A MEDICAL GAS SUPPLIER - provides N2O (nitrous oxide), O2 (oxygen)
- Remit to: LINDE GAS & EQUIPMENT INC., DEPT 0812, PO BOX 120812, DALLAS TX 75312-0812
- Customer Service: Tel# 800-266-4369

INVOICE FORMAT - CYLINDER RENTAL FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ [REMITTANCE INSTRUCTIONS at top]                                            │
│                                                                             │
│ PAGE    CUSTOMER NUMBER    DATE         INVOICE NUMBER    AMOUNT DUE       │
│ 1 OF 1    78944833      9/23/2025         52206233          385.42        │
│                                                                             │
│ BILL TO:                              SHIP TO:                             │
│ PACIFIC CREST SMILES                  PACIFIC CREST SMILES                 │
│ 16415 SE 15TH ST STE 105              16415 SE 15TH ST STE 105            │
│ VANCOUVER WA 98682-9802               VANCOUVER WA 98682-9802              │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Detach line for payment stub]                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ RENTAL DETAIL AND DESCRIPTION         TERMS: Net 30 Days                    │
│                                       PAYMENT DUE: [DATE]                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ ITEM NUMBER | ITEM DESCRIPTION | BEG BAL | CYL SHIP | CYL RETN | END BAL | │
│             |                  | OFFSET TYP | SUBJECT TO RENT | UNIT PRICE |│
│             |                  | AMOUNT | TAX Y/N                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ --CYLINDER RENT SUMMARY--                                                   │
│ RNTU410 | MED HIGH PRESSURE < 50CF | 19 | | | 19 | R2 | 589 | 0.4830 | 284.49 | Y │
│ UMZGOVM1 | SAFETY & ENVIRONMENTAL SERV FE | | 1 | | | EA | | 29.95 | 29.95 | Y │
│ UMZPCTM2 | CYL TRACKING SERVICE FEE | | 1 | | | EA | | 34.14 | 34.14 | Y │
│ USCCHARGE | SUPPLY CHAIN IMPACT | | 1 | | | EA | | 8.95 | 8.95 | Y │
├─────────────────────────────────────────────────────────────────────────────┤
│ --CYLINDER BALANCE DETAIL--                                                 │
│ NS M-E-MT | NITROUS OXIDE USP E 20 CF | 10 | | | 10                        │
│ OX M-E-MT | MEDICAL E | 7 | | | 7                                          │
│ OX M-AE-MT | OXYGEN USP E ALUM 24 CF MED | 2 | | | 2                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ SUBTOTAL TAX AMOUNT | INVOICE AMOUNT                                        │
│ 357.53   |  27.89   |  USD $ 385.42                                        │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header row after CUSTOMER NUMBER and DATE
   - Format: 8-digit number (e.g., 52206233)
   - Also shown as "INVOICE NUMBER: 52206233" in detail section

2. INVOICE DATE:
   - Position: Header row, column labeled "DATE"
   - Format: M/DD/YYYY (e.g., 9/23/2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: "PAYMENT DUE:" in TERMS section
   - Format: MM/DD/YYYY (e.g., 10/23/2025)
   - Terms: Net 30 Days

4. TOTAL AMOUNT:
   - Position: Header "AMOUNT DUE" column AND bottom "INVOICE AMOUNT"
   - Format: Decimal number (e.g., 385.42)
   - Includes tax

5. CUSTOMER NUMBER:
   - Position: Header row
   - Format: 8-digit (e.g., 78944833)

6. SHIP-TO / OFFICE LOCATION:
   - Position: "SHIP TO" section below header
   - Shows: PACIFIC CREST SMILES, address
   - Extract location from address city

7. BILLING PERIOD:
   - Position: In detail section "PERIOD"
   - Format: "M/DD/YYYY TO M/DD/YYYY"

COMMON CHARGE TYPES:
- RNTU410: Medical cylinder rental (high pressure < 50CF)
- UMZGOVM1: Safety & Environmental Service Fee
- UMZPCTM2: Cylinder Tracking Service Fee
- USCCHARGE: Supply Chain Impact fee

CYLINDER TYPES:
- NS M-E-MT: NITROUS OXIDE USP E 20 CF (N2O)
- OX M-E-MT: MEDICAL E (Oxygen)
- OX M-AE-MT: OXYGEN USP E ALUM 24 CF MED

OFFICE LOCATION MAPPING:
- Check SHIP TO address for city:
  * VANCOUVER WA → Columbia (or Ridgefield - check specific address)
  * 16415 SE 15TH ST → Columbia
  * Other addresses: Match to known office locations

GL ACCOUNT GUIDANCE (Based on 47+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases

Location-Specific Assignments:
- General-Columbia: 52120 Medical Gases (10 historical occurrences)
- All locations: 52120 Medical Gases

CRITICAL: Linde is a MEDICAL GAS supplier - ALWAYS use "Medical Gases" expense
Never use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 8-digit invoice number from header
2. Convert date from M/DD/YYYY to YYYY-MM-DD
3. Use INVOICE AMOUNT (includes tax) as total
4. Include all service fees (Environmental, Tracking, Supply Chain)
5. Note: These are rental charges, not product purchases`,

  'Kettenbach LP': `You are parsing invoices from Kettenbach LP.

VENDOR IDENTIFICATION:
- Primary Name: Kettenbach LP
- Address: 62-64 Enter Lane, Islandia NY 11749 USA
- Phone: (877) 532-2123
- Also shown: 16052 Beach Blvd. - Suite 221 - Huntington Beach, CA 92647-3809
- THIS IS A DENTAL SUPPLIES MANUFACTURER - impression materials, filling materials
- Accepts: MC, Visa, AMX, Discover

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                Invoice                                      │
│ Shipped To:                                                                 │
│  Pacific Crest Smiles - Roseburg                                           │
│  PO# P10142                                                                 │
│  1683 W Harvard Ave                                                         │
│  Roseburg OR 97471                                                          │
│                                                                             │
│ Invoice Number:                    415650                                   │
│ Invoice Date:                      07-28-2025                               │
│ Invoice Total:                     $207.95                                  │
│                                                                             │
│ PLEASE MAKE CHECKS PAYABLE TO:     Billed To:                              │
│ Kettenbach LP                       239058 39058                           │
│ 62-64 Enter Lane                    Pacific Crest Smiles                   │
│ Islandia NY 11749 USA               Attn: Accounts Payable - PO# P10142    │
│ (877) 532-2123                      1689 W Harvard Ave                     │
│                                     Roseburg OR 97471                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Detach line - Return upper portion with payment]                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Terms        FOB              Order No    CSR           Due Date           │
│ Net 15 Days  Shipping Point   P10142      Thomas Davis  08-17-2025        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Qty | Description                        | Unit Price | Line Price         │
│  1  | V FILL C A35 (RE-15015-6)         | $87.00     | $87.00             │
│  1  | SHP: 1 V FILL C A4 (RE-15016-5)   | $87.00     | $87.00             │
│      | K15016 [Exp 0227 Lot 2339409]     |            |                    │
│  1  | Mixing Tips, blue, 6.0mm          | $28.00     | $28.00             │
│      | (AC-17244-67)                     |            |                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                           Subtotal:    $202.00             │
│ 1 carton(s) shipped on 07-28-2025        Shipping:     $5.95              │
│ FEDN T#418415117093                       Invoice Total: $207.95           │
│ Shipping: FedEx Express Saver            Amount Paid:   $.00               │
│ Tracking Number: 418415117093            Amount Due:    $207.95            │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side header, after "Invoice Number:"
   - Format: 6-digit number (e.g., 415650)

2. INVOICE DATE:
   - Position: Below invoice number, after "Invoice Date:"
   - Format: MM-DD-YYYY (e.g., 07-28-2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: In terms row, after "Due Date"
   - Format: MM-DD-YYYY
   - Note: Terms are "Net 15 Days" (not 30)

4. TOTAL AMOUNT:
   - Position: Header "Invoice Total:" AND bottom "Invoice Total:" / "Amount Due:"
   - Format: Dollar amount (e.g., $207.95)

5. SHIP-TO / OFFICE LOCATION:
   - Position: "Shipped To:" section at top
   - Shows: "Pacific Crest Smiles - [Location]"
   - Example: "Pacific Crest Smiles - Roseburg"
   - Also check PO# which may contain location info

6. PO NUMBER:
   - Position: In Shipped To section AND Order No column
   - Format: P##### (e.g., P10142)

7. LINE ITEMS:
   - Columns: Qty | Description | Unit Price | Line Price
   - Product codes in parentheses (e.g., RE-15015-6, AC-17244-67)
   - May include: SHP prefix (shipped), Exp date, Lot number

COMMON PRODUCTS:
- V FILL C (filling material) - various shades (A35, A4)
- Mixing Tips - various sizes and colors
- Impression materials

OFFICE LOCATION MAPPING:
- "Pacific Crest Smiles - Roseburg" → Roseburg
- "Pacific Crest Smiles - Eugene" → Eugene
- Check "Shipped To" address for city

GL ACCOUNT GUIDANCE (Based on 36+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Roseburg: 10210 Dental Supplies Inventory (21 historical occurrences)
- All locations: 10210 Dental Supplies Inventory

CRITICAL: Kettenbach sells dental supplies/materials - use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 6-digit invoice number from header
2. Convert MM-DD-YYYY dates to YYYY-MM-DD
3. Use "Invoice Total" or "Amount Due" as total (include shipping)
4. Note: Terms are NET 15 DAYS (not 30)
5. CSR (Thomas Davis etc.) is sales rep - informational only`,

  'Miracle Cleaners': `You are parsing invoices from Miracle Cleaners.

VENDOR IDENTIFICATION:
- Primary Name: Miracle Cleaners
- THIS IS A LAUNDRY/CLEANING SERVICE - provides uniform cleaning, dry cleaning
- Service provider for dental office uniforms and linens

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Miracle Cleaners invoices are typically simple service invoices or receipts.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Receipt #", "Ticket #"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Date", "Service Date"
   - May be in filename (e.g., "DRY CLEANING 10.15.25" = October 15, 2025)

3. DUE DATE:
   - May not be explicitly shown
   - If not shown, use Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due", "Balance"
   - Position: Bottom of invoice

5. SERVICE LOCATION:
   - Which office received the cleaning service
   - May be shown in delivery/pickup address

6. SERVICE DETAILS:
   - Cleaning items (uniforms, scrubs, lab coats)
   - May show item counts or piece charges

OFFICE LOCATION MAPPING:
- Check delivery address for office location
- Common locations: Ridgefield, Columbia, Roseburg, Eugene, Salem, etc.

GL ACCOUNT GUIDANCE (Based on 59+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning

Location-Specific Assignments:
- General-Ridgefield: 53224 Uniforms & Cleaning (44 historical occurrences)
- General-Columbia: 53224 Uniforms & Cleaning (43 historical occurrences)
- All locations: 53224 Uniforms & Cleaning

CRITICAL: This is a CLEANING SERVICE - ALWAYS use "Uniforms & Cleaning" expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/receipt number from header
2. Check filename for date if not in document
3. Convert date to YYYY-MM-DD format
4. Use Total as invoice amount
5. Service invoices may be recurring/weekly`,

  'Ultradent Products Inc': `You are parsing invoices from Ultradent Products Inc.

VENDOR IDENTIFICATION:
- Primary Name: Ultradent Products Inc
- Also appears as: Ultradent
- THIS IS A DENTAL PRODUCTS MANUFACTURER - whitening, bonding agents, endodontic products
- Known for: Opalescence whitening, bonding agents, composite materials

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Ultradent invoices follow standard manufacturer invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Position: Top right header area

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"
   - Position: Header area near invoice number

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"
   - Or calculate from terms (typically Net 30)

4. TOTAL AMOUNT:
   - Look for: "Total", "Invoice Total", "Amount Due"
   - Position: Bottom right of invoice

5. SHIP-TO / OFFICE LOCATION:
   - Look for: "Ship To", "Deliver To"
   - Shows dental office name and address

6. LINE ITEMS:
   - Product details with item numbers
   - Columns: Item #, Description, Qty, Price, Extended
   - Common products: Opalescence, bonding agents, etchants

COMMON PRODUCTS:
- Opalescence (whitening products)
- Bonding agents
- Composite materials
- Endodontic products
- Etchants and primers

OFFICE LOCATION MAPPING:
- Extract from Ship-To address
- "Smiles Dental - [Location]" or "PC SMILES [Location]"

GL ACCOUNT GUIDANCE (Based on 67+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Salem: 10210 Dental Supplies Inventory (4 historical occurrences)
- All locations: 10210 Dental Supplies Inventory

CRITICAL: Ultradent sells dental products/supplies - use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header
2. Convert dates to YYYY-MM-DD format
3. Use Total/Amount Due as invoice amount
4. Include any shipping charges in total
5. If promotional pricing shown, use final total`,

  'Crystal Falls': `You are parsing invoices from Crystal Falls.

VENDOR IDENTIFICATION:
- Primary Name: Crystal Falls
- THIS IS A WATER/BEVERAGE DELIVERY SERVICE - provides bottled water, coolers

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Crystal Falls invoices are typically service/delivery invoices.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date", "Delivery Date"
   - Position: Header area

3. DUE DATE:
   - May not be explicitly shown
   - If not shown, use Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"
   - Position: Bottom of invoice

5. DELIVERY LOCATION:
   - Which office received the delivery
   - Check delivery address

6. SERVICE DETAILS:
   - Water bottles (5-gallon, etc.)
   - Cooler rental fees
   - Delivery charges

OFFICE LOCATION MAPPING:
- Extract from delivery address
- Match address to known office locations

GL ACCOUNT GUIDANCE (Based on 37+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses

Location-Specific Assignments:
- General-Roseburg: 53220 Office Expenses (11 historical occurrences)
- All locations: 53220 Office Expenses

CRITICAL: Water service is an OFFICE EXPENSE
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header
2. Convert dates to YYYY-MM-DD format
3. Use Total as invoice amount
4. Service may be recurring monthly`
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
