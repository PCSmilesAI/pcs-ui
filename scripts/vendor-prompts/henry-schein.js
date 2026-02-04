#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const prompt = `You are parsing invoices from Henry Schein, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Henry Schein, Inc.
- Common variations: Henry Schein, HS, Henry Schein Inc.
- IMPORTANT: "Henry Schein One" is a DIFFERENT company (software) - do not confuse
- Company identifier: HSI Federal ID# 11-3136595, HSI D&B# 01-243-0880
- Remit payments to: Henry Schein, Inc. Dept CH 10241 Palatine, IL 60055-0241 US

INVOICE FORMAT - CONSISTENT LAYOUT:
═══════════════════════════════════════════════════════════════════════════════

HEADER SECTION (TOP OF PAGE):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   INVOICE                                   │
│ [CENTER]                                                [RIGHT SIDE]        │
│                                                Ship/Sold-To: [7-digit #]    │
│                                                [Office Name]                │
│                                                [Address]                    │
│                                                [Doctor Name]                │
│                                                [City, State ZIP]            │
│                                                                             │
│                                                Bill-To: 4434143             │
│                                                Pacific Crest Smiles         │
│                                                1683 W Harvard Ave           │
│                                                ATTN: Accounts Payable       │
│                                                Roseburg, OR 97471-2812      │
├─────────────────────────────────────────────────────────────────────────────┤
│ [PAYMENT STUB SECTION - with barcode]                                       │
│ Pacific Crest Smiles                                                        │
│ 1683 W Harvard Ave                Invoice#    Invoice Date    Due Date    Invoice Total │
│ ATTN: Accounts Payable            50308256      12/01/25      12/31/25     $1753.83 │
│ Roseburg, OR 974712812                                                      │
│                                   Purchase Order#              Payment Terms │
│                                        P10530              Invoice Date + 30 days │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Payment stub section, header row after "Invoice#"
   - Format: 8-digit number (e.g., 50308256, 49981547)
   - Also repeated at bottom of each page in summary row

2. INVOICE DATE:
   - Position: Payment stub section, after Invoice#
   - Format: MM/DD/YY (e.g., 12/01/25)
   - CONVERT TO YYYY-MM-DD (e.g., 2025-12-01)

3. DUE DATE:
   - Position: Payment stub section, after Invoice Date
   - Format: MM/DD/YY (e.g., 12/31/25)
   - Usually Invoice Date + 30 days

4. INVOICE TOTAL:
   - Position: Payment stub section AND bottom of last page
   - Format: Dollar sign with amount (e.g., $1753.83)
   - The INVOICE TOTAL at bottom is the authoritative amount

5. SHIP-TO / OFFICE:
   - Position: TOP RIGHT, after "Ship/Sold-To:" with 7-digit number
   - Shows: Office name, address, doctor name
   - Examples:
     * "Ship/Sold-To: 4434148" → "Smiles Dental Lebanon, 175 Park St, Robert L Friess, Lebanon, OR"
     * "Ship/Sold-To: 4476157" → "Lake Oswego Smiles, 16699 Boones Ferry Rd Ste 200"

6. SHIP-TO NUMBER:
   - 7-digit customer number after "Ship/Sold-To:"
   - Maps to specific office locations

7. BILL-TO:
   - Always: "Bill-To: 4434143, Pacific Crest Smiles, 1683 W Harvard Ave, ATTN: Accounts Payable, Roseburg, OR 97471-2812"
   - This is the central billing address for all PCS offices

8. PURCHASE ORDER NUMBER:
   - Position: Payment stub section, after "Purchase Order#"
   - Format: P followed by 5 digits (e.g., P10530, P10499)
   - Often contains location code

LINE ITEMS TABLE:
═══════════════════════════════════════════════════════════════════════════════
Columns: LINE NO. | ITEM CODE | UNIT SIZE | DESCRIPTION | QTY ORDERED | QTY SHIPPED | CODES | UNIT PRICE | EXT. PRICE | BOX NO. | SHIP FROM

- LINE NO: Sequential number (1, 2, 3...)
- ITEM CODE: Product code (e.g., 712-6537, 707-0066)
- UNIT SIZE: Package size (e.g., 100/PK, 125/BX, 500/CA, EA)
- DESCRIPTION: Product name, may include notes like:
  * "** SPECIAL CONTRACT PRICE **"
  * "* SPECIAL SCHEIN PRICE REDUCTION *"
  * "CASE GOOD ITEM, MAY BE SHIPPED SEPARATELY"
  * SDS (Safety Data Sheet) instructions
- QTY ORDERED / QTY SHIPPED: Usually match
- CODES: Price/contract codes (*, $, C, W, SK)
- UNIT PRICE: Per-unit cost
- EXT. PRICE: Extended price (quantity × unit price)
- BOX NO: Shipping box number
- SHIP FROM: Warehouse code (NV = Nevada, NV2 = Nevada warehouse 2)

TOTALS SECTION (BOTTOM OF LAST PAGE):
═══════════════════════════════════════════════════════════════════════════════
                                    MERCHANDISE TOTAL    $1,747.34
                                      FREIGHT CHARGES        $6.49
                                         INVOICE TOTAL   $1,753.83

- MERCHANDISE TOTAL: Sum of all line items
- FREIGHT CHARGES: Shipping cost (typically $6.49-$15.49)
- INVOICE TOTAL: Final amount to pay (MERCHANDISE + FREIGHT)

FOOTER SUMMARY (REPEATED ON EACH PAGE):
═══════════════════════════════════════════════════════════════════════════════
Ship To#    Bill To#    Invoice#    Invoice Date    Invoice Total
4476157     4434143     50308256      12/01/25       $1753.83

Order#      Order Date    # of Boxes    PO#
71373107     12/01/25          3       P10530

Page X of Y

OFFICE LOCATION MAPPING (Ship-To Numbers):
═══════════════════════════════════════════════════════════════════════════════
Ship-To #   | Office Name              | Location
4434148     | Smiles Dental Lebanon    | Lebanon
4434143     | Pacific Crest Smiles     | Roseburg (HQ/Billing)
4434153     | Smiles Dental Riddle     | Riddle
4476157     | Lake Oswego Smiles       | Lake Oswego (Milwaukie area)
[Others]    | Check address for city   | Extract from address

Location Detection Priority:
1. Check "Ship/Sold-To" office name for location keyword
2. Check address city (Lebanon, OR → Lebanon)
3. Check PO# which sometimes contains location (e.g., "Riddle-General")

GL ACCOUNT GUIDANCE (Based on 450+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Roseburg: 10210 Dental Supplies Inventory (63 historical occurrences)
- General-Eugene: 10210 Dental Supplies Inventory (37 historical occurrences)
- General-Lebanon: 10210 Dental Supplies Inventory
- General-Salem: 10210 Dental Supplies Inventory
- General-Riddle: 10210 Dental Supplies Inventory
- General-Ridgefield: 10210 Dental Supplies Inventory
- General-Columbia: 10210 Dental Supplies Inventory
- General-Milwaukie: 10210 Dental Supplies Inventory

NOTE: Henry Schein is a dental SUPPLIES distributor - ALWAYS use Dental Supplies Inventory,
never Lab Fees or other expense accounts.
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:

1. INVOICE NUMBER: Extract 8-digit number from Invoice# field

2. DATE CONVERSION: Convert MM/DD/YY to YYYY-MM-DD
   - "12/01/25" → "2025-12-01"
   - "11/21/25" → "2025-11-21"

3. AMOUNT EXTRACTION:
   - Use INVOICE TOTAL from bottom of last page
   - Remove dollar signs and commas
   - "$1,753.83" → 1753.83

4. MULTI-PAGE HANDLING:
   - Check "Page X of Y" at bottom
   - Line items continue across pages
   - INVOICE TOTAL only appears on last page
   - Summary row repeats on each page

5. FREIGHT CHARGES:
   - Include freight in total (it's already included in INVOICE TOTAL)
   - Don't add freight separately

6. DOCUMENT TYPE DETECTION:
   - If header says "STATEMENT" → NOT an invoice, classify as Other Document
   - If shows "CREDIT MEMO" → Classify as Other Document (credit_memo)
   - Normal invoices show "INVOICE" centered at top

7. LINE ITEM NOTES:
   - Ignore "** SPECIAL CONTRACT PRICE **" annotations
   - Ignore SDS (Safety Data Sheet) instructions
   - TCN and M/F fields at end are tracking codes

8. PAYMENT TERMS:
   - Always "Invoice Date + 30 days"
   - Due Date = Invoice Date + 30`;

try {
  const result = db.prepare(`
    UPDATE vendor_knowledge_bases 
    SET knowledge_prompt = ?, updated_at = datetime('now')
    WHERE vendor_name = ?
  `).run(prompt, 'Henry Schein');
  
  console.log('✓ Henry Schein updated:', result.changes, 'rows affected');
} catch (err) {
  console.error('Error:', err.message);
}

db.close();
