#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const prompt = `You are parsing invoices from Patterson Dental Supply, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Patterson Dental Supply, Inc.
- Common variations: Patterson Dental, Patterson
- The company name appears in the footer as: Patterson Dental Supply, Inc., PO Box 732865, Dallas TX 75373-2865
- Branch locations appear as "Sold by:" line at bottom (e.g., Portland (D), Medford (D))

INVOICE FORMAT - Patterson has TWO distinct invoice formats:

═══════════════════════════════════════════════════════════════════════════════
FORMAT A: SOFTWARE/SERVICE INVOICES (Eaglesoft subscriptions, software fees)
═══════════════════════════════════════════════════════════════════════════════

FIELD LOCATIONS:
1. INVOICE NUMBER: 
   - Position: TOP RIGHT of page, first line of header
   - Label: "Invoice " followed by number
   - Example: "Invoice 3038927334"
   - Format: 10-digit numeric

2. INVOICE DATE:
   - Position: Second line from top, RIGHT SIDE
   - Label: "Date:" followed by date
   - Format: YYYY-MM-DD (e.g., 2025-09-11)

3. SHIP-TO OFFICE:
   - Position: LEFT SIDE, marked with vertical "SHIP TO" letters
   - Shows: "PC SMILES [LOCATION]" followed by address
   - Example: "PC SMILES EUGENE, 2201 WILLAMETTE ST STE A, EUGENE OR 97405"

4. SOLD-TO:
   - Position: LEFT SIDE, marked with vertical "SOLD TO" letters  
   - Usually same as Ship-To for this vendor

5. CUSTOMER NUMBER:
   - Position: Below addresses on left
   - Labels: "Customer #:" and "Bill Cust #:"
   - Format: 10-digit numbers starting with 02

6. LINE ITEMS TABLE:
   - Columns: Conf. Date | Conf. No. | Product No. | Description | Quantity | Unit | Unit Price | Amount | Tax
   - Product numbers are 8-digit (e.g., 73179157)
   - Common items: "SPRT CLINICAL MONTHLY", "EAGLESOFT SERVICE CLUB MONTHLY"

7. PAYMENT TERMS:
   - Position: BOTTOM LEFT
   - Always: "Net Due 30 Days from Inv. Date"
   - Remit to: Patterson Dental Supply, Inc., PO Box 732865, Dallas TX 75373-2865

8. TOTALS SECTION:
   - Position: BOTTOM RIGHT
   - Lines: Sub Total, Local Tax (0.000%), State Tax (0.000%), Total
   - Discounts shown on separate line if applicable (with minus sign)
   - Format: "$ 259.00"

9. PAGE INDICATOR:
   - Position: VERY BOTTOM
   - Format: "Page 1 of 1"
   - Sold by line: "Sold by: Portland (D)  7620 SW BRIDGEPORT RD PORTLAND OR 97224-7700"

═══════════════════════════════════════════════════════════════════════════════
FORMAT B: PRODUCT/SUPPLY INVOICES (physical dental supplies)
═══════════════════════════════════════════════════════════════════════════════

FIELD LOCATIONS:
1. INVOICE NUMBER:
   - Position: TOP RIGHT header area
   - Label: "Invoice #" (rightmost of three numbers)
   - Also shows: "Order #" and "Pack Slip #" 
   - Example header: "Order # 6207242626  Pack Slip # 8034983966  Invoice # 3038840482"

2. INVOICE DATE:
   - Position: RIGHT SIDE, below header
   - Label: "Invoice Date :"
   - Format: MM-DD-YYYY (e.g., 09-08-2025) - CONVERT TO YYYY-MM-DD

3. SHIP DATE:
   - Position: Above Invoice Date
   - Label: "Ship Date :"
   - Format: MM-DD-YYYY HH:MM:SS AM/PM

4. SHIP-TO OFFICE:
   - Position: LEFT SIDE, marked with vertical "SHIP TO" letters
   - Shows: "PC SMILES [LOCATION]" followed by full address
   - Example: "PC SMILES RIDGEFIELD, 109 S 65TH AVE STE 104, RIDGEFIELD WA 98642"

5. SOLD BY:
   - Position: CENTER, marked with vertical "SOLD BY" letters
   - Shows Patterson branch address

6. CUSTOMER INFO:
   - Customer #: 10-digit (e.g., 0201122325)
   - Bill Cust #: 10-digit
   - Telephone and Representative name

7. LINE ITEMS TABLE:
   - Columns: Product # | Ordered | Shipped | Unit | Vendor | Vendor #: | Description | Unit Price | Amount | Tax
   - Tax column shows "T" for taxable items
   - Product numbers: 8-digit (e.g., 71262070)
   - Units: BX (box), PAK (pack), BAG, EA (each)

8. TOTALS SECTION:
   - Position: BOTTOM RIGHT
   - Lines:
     * Sub Total
     * Local Tax (with percentage, e.g., "2.200 %")
     * State Tax (with percentage, e.g., "6.500 %")
     * Shipping and Handling
     * Discount (negative amount with trailing minus: "11.99-")
     * Total (final amount to pay)

9. PAYMENT TERMS:
   - Position: BOTTOM LEFT
   - Label: "Terms of Payment"
   - Always: "Net Due 30 Days from Inv. Date"

OFFICE LOCATION MAPPING:
Extract location from "PC SMILES [LOCATION]" in SHIP TO section:
- "PC SMILES EUGENE" or "2201 WILLAMETTE ST" → Eugene
- "PC SMILES ROSEBURG" or "1683 W HARVARD AVE" → Roseburg  
- "PC SMILES RIDGEFIELD" or "109 S 65TH AVE" → Ridgefield
- "PC SMILES SALEM" or "2245 MISSION" → Salem
- "PC SMILES LEBANON" → Lebanon
- "PC SMILES MILWAUKIE" → Milwaukie
- "PC SMILES RIDDLE" or "150 MAIN ST, RIDDLE" → Riddle
- "PC SMILES COLUMBIA" → Columbia

GL ACCOUNT GUIDANCE (Based on 523+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory

Location-Specific Assignments:
- General-Ridgefield: 10210 Dental Supplies Inventory (66 historical occurrences)
- General-Roseburg: 10210 Dental Supplies Inventory (65 historical occurrences)
- General-Salem: 10210 Dental Supplies Inventory
- General-Eugene: 10210 Dental Supplies Inventory
- General-Lebanon: 10210 Dental Supplies Inventory
- General-Milwaukie: 10210 Dental Supplies Inventory
- General-Riddle: 10210 Dental Supplies Inventory
- General-Columbia: 10210 Dental Supplies Inventory

NOTE: Patterson is a dental SUPPLIES vendor - ALWAYS use Dental Supplies Inventory, 
never Lab Fees or other expense accounts.
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. DETERMINE FORMAT FIRST:
   - If header shows "Order #" and "Pack Slip #" → Use FORMAT B rules
   - If header shows just "Invoice [number]" → Use FORMAT A rules

2. DATE CONVERSION:
   - Format A: Already YYYY-MM-DD, use as-is
   - Format B: Convert MM-DD-YYYY to YYYY-MM-DD

3. AMOUNT PARSING:
   - Remove dollar signs ($) and commas
   - Negative discounts shown with trailing minus (e.g., "11.99-" = -11.99)
   - Always use the "Total" line as the final invoice amount

4. TAX HANDLING:
   - Oregon locations: Usually 0% tax
   - Washington locations (Ridgefield, Columbia): Include sales tax

5. DOCUMENT TYPE DETECTION:
   - If document header says "STATEMENT" → NOT an invoice, classify as Other Document (statement)
   - If shows "CREDIT MEMO" → Classify as Other Document (credit_memo)

6. DUE DATE:
   - Always: Invoice Date + 30 days
   - Payment terms are always "Net Due 30 Days from Inv. Date"

7. MULTI-PAGE HANDLING:
   - Check "Page X of Y" at bottom
   - Line items may continue across pages
   - Totals always on final page`;

try {
  const result = db.prepare(`
    UPDATE vendor_knowledge_bases 
    SET knowledge_prompt = ?, updated_at = datetime('now')
    WHERE vendor_name = ?
  `).run(prompt, 'Patterson Dental');
  
  console.log('✓ Patterson Dental updated:', result.changes, 'rows affected');
} catch (err) {
  console.error('Error:', err.message);
}

db.close();
