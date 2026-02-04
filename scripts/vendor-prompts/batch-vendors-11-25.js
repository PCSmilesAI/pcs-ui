#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Brasseler': `You are parsing invoices from Brasseler USA Dental LLC.

VENDOR IDENTIFICATION:
- Primary Name: Brasseler USA Dental LLC
- Also appears as: Brasseler, BRASSLER USA, Brasseler USA, Brasseler U.S.A. Dental, LLC
- THIS IS A DENTAL INSTRUMENTS/BURS MANUFACTURER - rotary instruments, surgical burs
- Remit to: Brasseler USA Dental LLC, PO Box 223951, Pittsburgh, PA 15251-2951
- Customer Service: 800.841.4522

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Invoice                        Page 1 of 1     │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILL TO: [Customer#]                    SHIP TO: [Customer#]                │
│ SMILES DENTAL ROSEBURG                  SMILES DENTAL ROSEBURG              │
│ 1683 W HARVARD AVE                      1683 W HARVARD AVE                  │
│ ROSEBURG OR 97471-2812                  ROSEBURG OR 97471-2812              │
│ Tel: (541)673-3552                                                          │
│                     Payment Type: On Account                                │
├─────────────────────────────────────────────────────────────────────────────┤
│Payment Due | Customer # | Invoice # | Order # | Date Shipped | Your PO # | Sales Rep│
│ 11/09/25  |  1131085   | 6394387   | GF6MF/00|   10/10/25   |   P10331  |Chris Leighton│
├─────────────────────────────────────────────────────────────────────────────┤
│ Carrier: U05 UPS GROUND (G)         Payment Terms: Net 30                   │
├─────────────────────────────────────────────────────────────────────────────┤
│Ordered|Shipped|Backorder|Item|Item Description|UOM|Unit Price|Disc%|Sell Price|Extended Amount│
│   1   |   1   |    0    |001107U0|2 RASURG ROUND H1.24.010 5P|PK|33.10|66.00|11.25 US$|11.25│
├─────────────────────────────────────────────────────────────────────────────┤
│                            SHIPPING & HANDLING CHARGE         US$ 16.72     │
│                                                 SUBTOTAL:     US$ 136.72    │
│                                                    TOTAL:     US$ 136.72    │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header row, "Invoice #" column
   - Format: 7-digit number (e.g., 6394387)

2. INVOICE DATE:
   - Position: Header row, "Date Shipped" column
   - Format: MM/DD/YY (e.g., 10/10/25)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: Header row, "Payment Due" column
   - Format: MM/DD/YY (e.g., 11/09/25)
   - Terms: Net 30

4. TOTAL AMOUNT:
   - Position: Bottom right, "TOTAL:" line
   - Format: US$ followed by amount (e.g., US$ 136.72)

5. SHIP-TO / OFFICE LOCATION:
   - Position: "SHIP TO:" section
   - Shows: SMILES DENTAL [LOCATION] + address
   - Example: "SMILES DENTAL ROSEBURG" → Roseburg

6. CUSTOMER NUMBER:
   - Position: Header row and BILL TO section
   - Format: 7-digit (e.g., 1131085)

7. PO NUMBER:
   - Position: "Your PO #" column
   - Format: P##### (e.g., P10331)

8. LINE ITEMS:
   - Columns: Ordered | Shipped | Backorder | Item | Item Description | UOM | Unit Price | Disc % | Sell Price | Extended Amount
   - Products are dental burs and instruments
   - NOTE: Items sold in "Packs" (PK) not pieces

GL ACCOUNT GUIDANCE (Based on 24+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Roseburg: 10210 Dental Supplies Inventory (13 historical occurrences)
- All locations: 10210 Dental Supplies Inventory

CRITICAL: Brasseler sells dental instruments/supplies - use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 7-digit invoice number
2. Convert MM/DD/YY to YYYY-MM-DD
3. Use TOTAL as invoice amount (includes shipping)
4. Discounts are already applied in "Sell Price"
5. Note late charge: 1.5% per month on past due`,

  'Oregon Linen': `You are parsing invoices from Oregon Linen Inc.

VENDOR IDENTIFICATION:
- Primary Name: Oregon Linen Inc.
- Address: 608 SE Lane Ave, Roseburg, OR 97470
- Phone: (541) 672-1663
- Website: www.oregonlinen.com
- THIS IS A LINEN/LAUNDRY SERVICE - floor mats, towels, uniforms

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│         9/10/2025                    OREGON LINEN INC.                      │
│    DATE                              608 SE LANE AVE                        │
│                                      ROSEBURG, OR 97470                     │
│ INVOICE #     1282639                (541) 672-1663                         │
│ CONTRACT #    18778600               www.oregonlinen.com                    │
│ P.O. #                                                                      │
│                                                                             │
│ PACIFIC CREST SMILES/ROSEBURG   E                              18          │
│ 1683 W HARVARD AVE                   N10    Wed    110   172687            │
│ ROSEBURG, OR 97470                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│QTY | DESCRIPTION           | WEARER | SIZE | EMP# | ITEM | INVT | EXTENTION│
│ 2  | 3X4 MAT SILVER        |        |      |      | 6134 |   4  |    $8.43 │
│ 1  | 3X5 SUPER-TREAD       |        |      |      | 6186 |   2  |    $4.92 │
│ 2  | 3X4 BLUE SILVER MAT   |        |      |      | 6284 |   4  |    $8.43 │
│ 1  | 4X6 BLUE SILVER MAT   |        |      |      | 6286 |   2  |    $7.41 │
│    | EASE PROGRAM          |        |      |      | EASE |      |    $5.00 │
│    | CIP-MATS/MOPS         |        |      |      | CIP-M|      |    $2.34 │
│    | SERVICE CHARGE        |        |      |      | SVC  |      |    $3.47 │
├─────────────────────────────────────────────────────────────────────────────┤
│ #6666                               Invoice Total:              $40.00      │
│                                                                             │
│ Received By                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Left side, after "INVOICE #"
   - Format: 7-digit (e.g., 1282639)

2. INVOICE DATE:
   - Position: Top left, labeled "DATE"
   - Format: M/DD/YYYY (e.g., 9/10/2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - NOT explicitly shown
   - Standard terms: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: Bottom, "Invoice Total:"
   - Format: Dollar amount (e.g., $40.00)

5. SERVICE LOCATION:
   - Position: Customer name/address section
   - Shows: "PACIFIC CREST SMILES/[LOCATION]"
   - Example: "PACIFIC CREST SMILES/ROSEBURG" → Roseburg

6. CONTRACT NUMBER:
   - Position: Below Invoice #
   - Format: 8-digit (e.g., 18778600)

7. LINE ITEMS:
   - Columns: QTY | DESCRIPTION | WEARER | SIZE | EMP# | ITEM | INVT | EXTENTION
   - Common items: Floor mats (3X4, 3X5, 4X6), Service charges, EASE Program

COMMON SERVICES:
- Floor mats (various sizes)
- EASE PROGRAM (maintenance program)
- CIP-MATS/MOPS (cleaning)
- SERVICE CHARGE

GL ACCOUNT GUIDANCE (Based on 25+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning

Location-Specific Assignments:
- General-Roseburg: 53224 Uniforms & Cleaning (25 historical occurrences)
- All locations: 53224 Uniforms & Cleaning

CRITICAL: Linen service - use "Uniforms & Cleaning" expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 7-digit invoice number
2. Convert date to YYYY-MM-DD
3. Use "Invoice Total" as amount
4. Recurring weekly service`,

  'Airgas USA LLC': `You are parsing invoices from Airgas USA, LLC.

VENDOR IDENTIFICATION:
- Primary Name: Airgas USA, LLC
- Also appears as: Airgas
- Remit to: Airgas USA, LLC, PO Box 102289, Pasadena CA 91189-2289
- Customer Service: 800-224-7427
- THIS IS A MEDICAL GAS SUPPLIER - N2O (nitrous oxide), O2 (oxygen) cylinder rentals

INVOICE FORMAT - CYLINDER RENTAL:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                 AIRGAS USA, LLC                             │
│                            CYLINDER RENTAL INVOICE                          │
│                                                                             │
│ INVOICE DATE    PAYER     INVOICE NO.     DUE DATE    PAY THIS AMOUNT      │
│ 09/30/2025     5038665    5519822721    10/30/2025      $ 944.70           │
├─────────────────────────────────────────────────────────────────────────────┤
│ SOLD BY: AIRGAS USA, LLC (W219)                                             │
│          2446 NE DIAMOND LAKE BLVD                                          │
│          ROSEBURG OR 97470-3643                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BILL TO: PACIFIC CREST SMILES                                               │
│          1683 W HARVARD AVE                                                 │
│          ROSEBURG OR 97471-2812                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ INVOICE NO. | SOLD TO # | SHIP TO | INVOICE DATE | RENTAL PO # | TERMS     │
│ 5519822721  |           | 5038665 |   5039156    | 09/30/2025  | RENT | NET 30│
├─────────────────────────────────────────────────────────────────────────────┤
│ MATERIAL/DESCRIPTION | BEG BAL | SHIP | RETURN | ADJ | END BAL | NET DAYS | RATE | PRICE│
│ RRCYLMXS-NS Rent Cyl Med Xs Nitrous Oxide                                   │
│   6 | 0 | 1 | 0 | 5 | 0 | 5 | 168 | $2.28/DAY | $383.04                    │
│ CY-NS USPE - CYL NITROUS OXIDE USP E CGA 910                               │
│ RRCYLMXS-OX Rent Cyl Med Xs Oxygen                                         │
│   7 | 4 | 3 | 0 | 8 | 0 | 8 | 222 | $2.28/DAY | $506.16                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Rental Period: From: 09/01/2025  To: 09/30/2025                             │
│                                                  Hazmat:        55.50       │
│                                                  AMOUNT      $ 944.70       │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header "INVOICE NO." column
   - Format: 10-digit (e.g., 5519822721)

2. INVOICE DATE:
   - Position: Header "INVOICE DATE" column
   - Format: MM/DD/YYYY (e.g., 09/30/2025)

3. DUE DATE:
   - Position: Header "DUE DATE" column
   - Format: MM/DD/YYYY
   - Terms: NET 30

4. TOTAL AMOUNT:
   - Position: Header "PAY THIS AMOUNT" AND bottom "AMOUNT"
   - Format: $ followed by amount (e.g., $ 944.70)

5. BILL-TO / OFFICE LOCATION:
   - Position: "BILL TO" section
   - Shows: PACIFIC CREST SMILES + address
   - Extract location from city in address

6. PAYER NUMBER:
   - Position: Header, 7-digit (e.g., 5038665)

7. RENTAL PERIOD:
   - Position: Near bottom
   - Shows: "From: MM/DD/YYYY To: MM/DD/YYYY"

CYLINDER TYPES:
- RRCYLMXS-NS: Nitrous Oxide rental
- CY-NS USPE: Nitrous Oxide USP E cylinder
- RRCYLMXS-OX: Oxygen rental
- CY-OX USPE: Oxygen USP Medical Pure E

GL ACCOUNT GUIDANCE (Based on 20+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases

Location-Specific Assignments:
- General-Roseburg: 52120 Medical Gases (9 historical occurrences)
- All locations: 52120 Medical Gases

CRITICAL: Airgas is a medical gas supplier - ALWAYS use "Medical Gases" expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 10-digit invoice number
2. Use INVOICE DATE from header
3. Use "PAY THIS AMOUNT" as total (includes hazmat fee)
4. Rental charges calculated per-day
5. Hazmat charge included in total`,

  'MegaGen America': `You are parsing invoices from MegaGen America.

VENDOR IDENTIFICATION:
- Primary Name: MegaGen America
- Address: 39-40 Broadway, Fair Lawn, NJ 07410, USA
- Phone: +1 (844) 288-5425
- THIS IS A DENTAL IMPLANT COMPANY - implants, abutments, surgical kits

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                              INVOICE                                        │
│ MegaGen America                                                             │
│ 39-40 Broadway                           Date          9/9/2025             │
│ Fair Lawn, NJ 07410                      Invoice #     PS-INV177040         │
│ USA                                      Customer ID   2005466275           │
│ Phone: +1 (844) 288-5425                 Date Paid     9/9/2025             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bill To:                                 Ship To:                           │
│ Smiles Dental - Roseburg                 Smiles Dental - Roseburg          │
│ Pacific Crest Smiles                     1683 West Harvard Ave              │
│ 1683 W Harvard Ave                       Roseburg, OR 97471                 │
│ Roseburg, OR 97471                       USA                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ P.O. Number | Sales Rep | Tracking # | Ship Via | Terms | Ship Date | Due Date│
│ TAKISHA/LB | Steven Dietrich | 1Z629E5V... | UPS | Prepaid | 9/9/2025 | 9/9/2025│
├─────────────────────────────────────────────────────────────────────────────┤
│ Item # | Description | Qty | Unit Price | Total                             │
│ FANIHX5010SC | XPEED AnyRidge Internal Fixture... | 1 | 150.00 | 150.00    │
│ AANHAF0505 | Healing Abutment [AR] Ø5/ H=5 | 1 | 44.25 | 44.25             │
│ 2DAY PM | Shipping & Handling:2Day PM | 1 | 21.00 | 21.00                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                          Subtotal:        $ 215.25          │
│                                          Sales Tax:              -          │
│                                          Grand Total:     $ 215.25          │
│                                          Payments/Credits:$ 215.25          │
│                                          Balance Due:            -          │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Right side header, "Invoice #"
   - Format: PS-INV###### (e.g., PS-INV177040)

2. INVOICE DATE:
   - Position: Right side header, "Date"
   - Format: M/D/YYYY (e.g., 9/9/2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: Header row "Due Date" column
   - May be same as ship date if prepaid

4. TOTAL AMOUNT:
   - Position: "Grand Total:" line
   - Format: $ followed by amount
   - NOTE: If "Balance Due: -" then already paid (prepaid)

5. SHIP-TO / OFFICE LOCATION:
   - Position: "Ship To:" section
   - Shows: "Smiles Dental - [Location]"
   - Example: "Smiles Dental - Roseburg" → Roseburg

6. CUSTOMER ID:
   - Position: Right header, "Customer ID"
   - Format: 10-digit (e.g., 2005466275)

7. LINE ITEMS:
   - Columns: Item # | Description | Qty | Unit Price | Total
   - Products: Implants, abutments, fixtures
   - Shipping shown as line item

COMMON PRODUCTS:
- XPEED AnyRidge Internal Fixture - implant fixtures
- Healing Abutment - healing caps
- Various implant components

GL ACCOUNT GUIDANCE (Based on 30+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Dental implants are high-value supplies - use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number including "PS-INV" prefix
2. Convert M/D/YYYY to YYYY-MM-DD
3. Use "Grand Total" as amount
4. Note: May show "Prepaid" - Balance Due: -
5. Tracking number for shipping reference`,

  'Iron Mountain': `You are parsing invoices from Iron Mountain.

VENDOR IDENTIFICATION:
- Primary Name: Iron Mountain
- Address: 2 Sun Court, Norcross, GA 30092
- Support: https://www.ironmountain.com/support
- THIS IS A DOCUMENT STORAGE/SHREDDING SERVICE - records management

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Invoice                      Page 1 of 2       │
│                                                                             │
│                         Account Overview                                    │
│                         Invoice Number:              KGSL018                │
│ 2 Sun Court             Invoice Date:               03/31/2025              │
│ Norcross, GA 30092                                                          │
│                         Service Period:    02/26/2025 - 03/25/2025         │
│                         Customer ID/Name: 1P158/SMILES DENTAL               │
├─────────────────────────────────────────────────────────────────────────────┤
│ SMILES DENTAL                                                               │
│ KAREN KIPNEY                                                                │
│ 10013 NE HAZEL DELL AVE                 Due By:           04/30/2025       │
│ SUITE 501                                                                   │
│ VANCOUVER, WA 98685                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                       New Charges                                           │
│                       Storage               0.00                            │
│                       Service           1,244.75                            │
│                       Supplies              0.00                            │
│                       Other Charges       386.33                            │
│                       Tax                   0.00                            │
│                                                                             │
│                       INVOICE AMOUNT DUE  $1,631.08                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Page 2 - Service Details:                                                   │
│ Description | Qty | Rate | Amount                                          │
│ OFFSITE SHRED SERVICE MINIMUM | 2.00 | 87.010 | 174.02                     │
│ OFFSITE SHRED SERVICE MINIMUM | 1.00 | 76.600 | 76.60                      │
│ OFFSITE SHRED, MINI CONSOLE | 6.00 | 41.240 | 247.44                       │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Account Overview section, "Invoice Number:"
   - Format: Alphanumeric (e.g., KGSL018)

2. INVOICE DATE:
   - Position: Account Overview section, "Invoice Date:"
   - Format: MM/DD/YYYY (e.g., 03/31/2025)

3. DUE DATE:
   - Position: "Due By:" line
   - Format: MM/DD/YYYY

4. TOTAL AMOUNT:
   - Position: "INVOICE AMOUNT DUE" line
   - Format: $ with commas (e.g., $1,631.08)

5. SERVICE LOCATION:
   - Position: Bill-to address section
   - Shows: SMILES DENTAL + address
   - Extract city from address (VANCOUVER → Columbia area)

6. CUSTOMER ID:
   - Position: "Customer ID/Name:" line
   - Format: ID/NAME (e.g., 1P158/SMILES DENTAL)

7. SERVICE PERIOD:
   - Position: Account Overview
   - Shows: MM/DD/YYYY - MM/DD/YYYY

CHARGE CATEGORIES:
- Storage: Document storage fees
- Service: Shredding, retrieval, etc.
- Supplies: Boxes, containers
- Other Charges: Miscellaneous
- Tax: If applicable

GL ACCOUNT GUIDANCE (Based on 28+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services

Location-Specific Assignments:
- General-Lebanon: 53361 Contract Services (2 historical occurrences)
- All locations: 53361 Contract Services

CRITICAL: Document storage/shredding - use "Contract Services" expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract alphanumeric invoice number
2. Use MM/DD/YYYY date format
3. Use "INVOICE AMOUNT DUE" as total
4. Note: May have auto-payment enrolled
5. Multi-page invoice - totals on page 1`,

  'Trilogy Medwaste West LLC': `You are parsing invoices from Trilogy Medwaste West LLC.

VENDOR IDENTIFICATION:
- Primary Name: Trilogy Medwaste West LLC
- Also appears as: Trilogy Medwaste
- Address: 3 Riverway, Ste 1050, Houston, TX 77056-1919
- Phone: (713) 300-1880
- Remit to: PO Box 670567, Dallas, TX 75267
- THIS IS A MEDICAL WASTE DISPOSAL SERVICE - regulated medical waste, sharps

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                INVOICE #      1839735       │
│ Trilogy Medwaste West LLC                      ACCOUNT #      3405083       │
│ 3 Riverway, Ste 1050                           DATE     October 31, 2025    │
│ Houston, TX 77056-1919                         DUE      November 30, 2025   │
│ (713) 300-1880                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Pacific Crest Smiles                   MAKE ALL CHECKS PAYABLE TO:          │
│ 109 S 65th Ave Suite 104               Trilogy Medwaste West LLC            │
│ Ridgefield, WA 98642-3407              PO Box 670567, Dallas, TX 75267      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Site 3405083001 - Smiles Dental - 109 S 65th Ave Suite 104                  │
│ WO # | DATE | DESCRIPTION | QTY | UNIT RATE | TOTAL                         │
│ 3398955 | 10/01/25 | 17gal RMW/Sharps Reusable Tariff Container | 1.00 | 0.00 | 0.00│
│ 3398955 | 10/01/25 | Washington Tariff | 17.00 | 2.09 | 35.53               │
│ 3398955 | 10/01/25 | RMW Work Order Minimum | 1.00 | 10.47 | 10.47          │
│                                                    Taxes | 0.00             │
│                                              Site Total | 46.00              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                            Sub Total      46.00             │
│                                            Surcharges      0.00             │
│                                            Tax             0.00             │
│                                            Invoice Total  46.00             │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "INVOICE #"
   - Format: 7-digit (e.g., 1839735)

2. INVOICE DATE:
   - Position: Top right, "DATE"
   - Format: Month Day, Year (e.g., October 31, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: Top right, "DUE"
   - Format: Month Day, Year

4. TOTAL AMOUNT:
   - Position: "Invoice Total" at bottom
   - Format: Dollar amount (e.g., 46.00)

5. SERVICE LOCATION:
   - Position: "Site" line shows address
   - Shows: "Smiles Dental - [Address]"
   - Example: "109 S 65th Ave" → Ridgefield

6. ACCOUNT NUMBER:
   - Position: Top right, "ACCOUNT #"
   - Format: 7-digit (e.g., 3405083)

7. WORK ORDER:
   - Position: WO # column
   - Format: 7-digit

SERVICE TYPES:
- RMW/Sharps Reusable Tariff Container
- Washington Tariff (state-specific fees)
- RMW Work Order Minimum

GL ACCOUNT GUIDANCE (Based on 15+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53225 Hazardous Disposal

Location-Specific Assignments:
- General-Columbia: 53225 Hazardous Disposal (3 historical occurrences)
- All locations: 53225 Hazardous Disposal

CRITICAL: Medical waste disposal - use "Hazardous Disposal" expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 7-digit invoice number
2. Convert "Month Day, Year" to YYYY-MM-DD
3. Use "Invoice Total" as amount
4. Site address indicates location
5. Certified waste treatment compliance included`,

  'Fyle Inc': `You are parsing invoices from Fyle, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Fyle, Inc.
- Address: 2035 Sunset Lake Road, Suite B-2, Newark, Delaware 19702
- Phone: +1 302-565-3873
- Email: billing@fylehq.com
- THIS IS A SOFTWARE/EXPENSE MANAGEMENT SERVICE - SaaS subscription

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                             Invoice                                         │
│ Invoice number  QDSNFCRE-0004                                               │
│ Date of issue   August 15, 2025                                             │
│ Date due        August 22, 2025                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fyle, Inc.                             Bill to                              │
│ 2035 Sunset Lake Road                  Pacific Crest Smiles                 │
│ Suite B-2                              1683 W Harvard Ave                   │
│ Newark, Delaware 19702                 Roseburg, Oregon 97471               │
├─────────────────────────────────────────────────────────────────────────────┤
│ $209.86 USD due August 22, 2025                                             │
│ We do not accept check payment                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Description | Qty | Unit price | Amount                                     │
│ Fyle monthly subscription | 14 | $14.99 | $209.86                          │
│ Aug 15 – Sep 15, 2025                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                        Subtotal    $209.86                  │
│                                        Total       $209.86                  │
│                                        Amount due  $209.86 USD              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Bank Transfer Details:                                                      │
│ Bank name: Wells Fargo                                                      │
│ Routing number: 121000248                                                   │
│ Account number: 40630289444859391                                           │
│ Reference: QDSNFCRE-0004                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top, "Invoice number"
   - Format: Alphanumeric (e.g., QDSNFCRE-0004)

2. INVOICE DATE:
   - Position: "Date of issue"
   - Format: Month Day, Year (e.g., August 15, 2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - Position: "Date due"
   - Format: Month Day, Year
   - NOTE: Short payment terms (7 days)

4. TOTAL AMOUNT:
   - Position: "Amount due" at bottom OR header
   - Format: $XXX.XX USD

5. BILLING ENTITY:
   - Position: "Bill to" section
   - Usually Pacific Crest Smiles corporate

6. SUBSCRIPTION DETAILS:
   - Shows number of users and per-user rate
   - Subscription period dates

GL ACCOUNT GUIDANCE (Based on 19+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53330 IT Expenses:53334 Software

Class: Corp-Finance (2 historical occurrences)

CRITICAL: Software subscription - use "IT Expenses:Software"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract alphanumeric invoice number
2. Convert "Month Day, Year" to YYYY-MM-DD
3. Use "Amount due" as total
4. Note: Does NOT accept checks - wire/card only
5. Short payment terms (7 days typical)`,

  'Heaths Laundry': `You are parsing invoices from Heath's Laundry.

VENDOR IDENTIFICATION:
- Primary Name: Heath's Laundry
- Also appears as: Heaths Laundry, HEATH'S LAUNDRY
- Address: 521 3RD AVE. SW, ALBANY, OR 97321
- Phone: (541) 926-2947
- Email: heathlaundry@comcast.net
- THIS IS A LAUNDRY/UNIFORM SERVICE - scrubs, lab coats, towels

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Company: SMILES DENTAL. To: Invoice 13970.                                  │
│                              Invoice                                        │
│ HEATH'S LAUNDRY                              SMILES DENTAL                  │
│ 521 3RD AVE. SW                              175 PARK STREET                │
│ ALBANY, OR 97321  (541)926-2947              LEBANON, OR 97355 (541)258-4746│
├─────────────────────────────────────────────────────────────────────────────┤
│ Date | Invoice | Day | Garment Mark | Freq. | Seq | Term | Account | Route │
│ 09/10/2025 | 13970 | Wed | | 7 | 210 | CHG | 940-00000 | 1                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Line | Item | Empl | Name/Description | Sizes | Qty. | Inv. | Min. | Unit Pr. | Ext. Price│
│ 1 | BAGBAR | | BARRIER BAG | | 0 | 0 | 0 | $0.5000 | $0.00               │
│ 2 | PILLOW+ | | NOG PILLOW | | 2 | 0 | 0 | $3.0000 | $6.00               │
│ 3 | BATHTWL+ | | NOG BATH TOWEL | | 2 | 0 | 0 | $0.6000 | $1.20          │
│ 4 | LABCOAT+ | | NOG LAB COAT | | 3 | 0 | 0 | $4.2500 | $12.75           │
│ 5 | HANTOWEL+ | | NOG HAND TOWELS | | 2 | 0 | 0 | $0.6000 | $1.20        │
│   | ENERGY CHARGE | | | | | | | | $6.50                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                              Subtotal:    $27.65           │
│                                              Sales Tax:    $0.00           │
│                                              Prebill:     $27.65           │
│                                                                             │
│                                              Net Charge:  $27.65           │
│ Received By:                                                                │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Header row, "Invoice" column
   - Format: 5-digit (e.g., 13970)

2. INVOICE DATE:
   - Position: Header row, "Date" column
   - Format: MM/DD/YYYY (e.g., 09/10/2025)

3. DUE DATE:
   - NOT explicitly shown
   - Standard terms: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: "Net Charge:" at bottom
   - Format: Dollar amount (e.g., $27.65)

5. SERVICE LOCATION:
   - Position: Right side header - customer address
   - Shows: "SMILES DENTAL, [ADDRESS], [CITY]"
   - Example: "175 PARK STREET, LEBANON" → Lebanon

6. ACCOUNT NUMBER:
   - Position: Header row, "Account" column
   - Format: XXX-XXXXX (e.g., 940-00000)

7. LINE ITEMS:
   - Columns: Line | Item | Empl | Name/Description | Sizes | Qty. | Inv. | Min. | Unit Pr. | Ext. Price
   - Items include: PILLOW+, BATHTWL+, LABCOAT+, HANTOWEL+, ENERGY CHARGE

COMMON SERVICES:
- NOG PILLOW - pillows
- NOG BATH TOWEL - bath towels
- NOG LAB COAT - lab coats
- NOG HAND TOWELS - hand towels
- ENERGY CHARGE - surcharge

GL ACCOUNT GUIDANCE (Based on 21+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning

Location-Specific Assignments:
- General-Lebanon: 53224 Uniforms & Cleaning (26 historical occurrences)
- All locations: 53224 Uniforms & Cleaning

CRITICAL: Laundry/uniform service - use "Uniforms & Cleaning" expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 5-digit invoice number
2. Use MM/DD/YYYY date format
3. Use "Net Charge" as total amount
4. Weekly service (Freq. 7)
5. "Received By" line for signature`,

  'Maxxeus': `You are parsing invoices from Maxxeus.

VENDOR IDENTIFICATION:
- Primary Name: Maxxeus
- THIS IS A DENTAL SUPPLIES VENDOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Standard dental supply invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"
   - Position: Header area

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
   - Columns typically include item, description, qty, price

GL ACCOUNT GUIDANCE (Based on 22+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Roseburg: 10210 Dental Supplies Inventory (primary)
- All locations: 10210 Dental Supplies Inventory

CRITICAL: Dental supplies - use "Dental Supplies Inventory"
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header
2. Convert dates to YYYY-MM-DD format
3. Use Total as invoice amount
4. Include shipping charges if present`,

  'Pacific Crest Smiles': `You are parsing invoices from Pacific Crest Smiles.

VENDOR IDENTIFICATION:
- Primary Name: Pacific Crest Smiles
- NOTE: This is INTERNAL - Pacific Crest Smiles invoicing itself
- May be inter-company transfers, allocations, or internal charges

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Internal company invoice - may vary in format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Billing Document #"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Date", "Invoice Date"
   - Position: Header area

3. DUE DATE:
   - May or may not be shown
   - Internal transfers may have different terms

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount"
   - Position: Bottom of document

5. FROM/TO OFFICES:
   - Shows which offices are involved
   - Inter-company transfer details

GL ACCOUNT GUIDANCE (Based on 36+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
May involve multiple GL accounts depending on nature of transfer.
Review line items to determine appropriate categorization.
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Verify this is a valid invoice and not just internal documentation
2. Extract invoice/document number
3. Identify the nature of the charge
4. May require special handling as inter-company`,

  'Clipboard Health': `You are parsing invoices from Clipboard Health.

VENDOR IDENTIFICATION:
- Primary Name: Clipboard Health
- THIS IS A STAFFING/HEALTHCARE STAFFING SERVICE - temporary healthcare workers

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Staffing service invoice format.

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number"
   - Example format from filename: "Invoice 491928-1"
   - Position: Header area

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date"
   - Position: Header area

3. DUE DATE:
   - Look for: "Due Date", "Payment Due"
   - Position: Header area

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due"
   - Position: Bottom of invoice

5. SERVICE LOCATION:
   - Which office used staffing services
   - May include worker assignment details

6. STAFFING DETAILS:
   - Worker hours
   - Hourly rates
   - Service dates

GL ACCOUNT GUIDANCE (Based on 35+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
Review line items for specific staffing categories.
May vary based on position type filled.
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number from header or filename
2. Convert dates to YYYY-MM-DD format
3. Use Total as invoice amount
4. Note staffing period covered`
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
