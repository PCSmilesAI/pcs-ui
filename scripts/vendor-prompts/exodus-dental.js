#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const prompt = `You are parsing invoices from Exodus Dental Solutions.

VENDOR IDENTIFICATION:
- Primary Name: Exodus Dental Solutions
- Address: 701 NE 136th Ave, Suite 200, Vancouver, WA 98684
- Phone: 1844.396.3871 ext 3
- THIS IS A DENTAL LAB - they provide dental laboratory services (crowns, dentures, night guards, etc.)

INVOICE FORMAT - SIMPLE CONSISTENT LAYOUT:
═══════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ Exodus Dental Solutions                                                     │
│ 701 NE 136th Ave                               INVOICE                      │
│ Suite 200                                      No. [4-digit]                │
│ Vancouver, WA 98684                            [M/DD/YYYY or MM/DD/YYYY]    │
│ 1844.396.3871 ext 3                                                         │
│                                                Ship To:                     │
│                                                [Office Name]                │
│                                                [Contact Name]               │
│                                                [Address]                    │
│                                                [City, State ZIP]            │
│                                                [Phone]                      │
│                                                                             │
│ Patient: [PATIENT NAME IN CAPS]                                             │
│                                                                             │
│ Description                                                    Amount       │
│ ─────────────────────────────────────────────────────────────────────       │
│ [Lab Work Description] #[tooth numbers]                        $XX.XX       │
│                                                                             │
│ [Additional items like 3D Model Printing]                      $XX.XX       │
│ Shade: Body: [shade code]                                                   │
│                                                                             │
│                                                                             │
│                                                         Total: $XXX.XX      │
└─────────────────────────────────────────────────────────────────────────────┘

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: TOP RIGHT, after "No."
   - Format: 4-digit number (e.g., 5972, 5968, 5195)
   - Example: "No. 5972"

2. INVOICE DATE:
   - Position: BELOW invoice number on RIGHT SIDE
   - Format: M/DD/YYYY or MM/DD/YYYY (e.g., 11/17/2025, 8/28/2025)
   - CONVERT TO YYYY-MM-DD

3. DUE DATE:
   - NOT explicitly shown on invoice
   - Standard terms: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: BOTTOM RIGHT of invoice
   - Label: "Total:"
   - Format: Dollar sign with amount (e.g., "Total: $163.00")

5. SHIP-TO / OFFICE LOCATION:
   - Position: RIGHT SIDE, after "Ship To:"
   - Shows: Office name, contact person, address, phone
   - Format: "Smiles Dental - [Location]"
   - Examples:
     * "Smiles Dental - Ridgefield" → Ridgefield
     * "Smiles Dental - Columbia" → Columbia
     * "Smiles Dental - Roseburg" → Roseburg

6. CONTACT PERSON:
   - Position: Below office name in Ship To section
   - Usually the dentist or office manager name

7. PATIENT NAME:
   - Position: LEFT SIDE, after "Patient:"
   - Format: UPPERCASE (e.g., "HOLLY ANDREWS", "SEAN NEWTON")
   - THIS IS DENTAL LAB WORK - patient name is important for case tracking

8. LINE ITEMS:
   - Position: Two-column table (Description | Amount)
   - Description column includes:
     * Lab work type (e.g., "Full-Contour Zirconia", "Comfort H/S NG UPPER")
     * Tooth numbers after # (e.g., "#29, #30")
     * Quantity notation if multiple (e.g., "(2 x $69.00)")
   - Additional items like:
     * "3D Model Printing" or "3D Model Printing - Half Arch"
     * "Shade: Body: [code]" (e.g., A2, A3)

COMMON LAB WORK TYPES:
═══════════════════════════════════════════════════════════════════════════════
- Full-Contour Zirconia (crowns)
- Comfort H/S NG (night guards) - UPPER or LOWER
- 3D Model Printing
- Package Finish Direct
- Single Anterior
- Additional Wire Clasp
- Duplicate Model
- Rush (may be waived as "Loyal Customer Discount - Rush Fee Waived")
- Implant Crowns
- Dentures (full/partial)

OFFICE LOCATION MAPPING:
═══════════════════════════════════════════════════════════════════════════════
"Smiles Dental - Ridgefield" → Ridgefield
"Smiles Dental - Columbia" → Columbia
"Smiles Dental - Roseburg" → Roseburg
"Smiles Dental - Eugene" → Eugene
"Smiles Dental - Salem" → Salem
"Smiles Dental - Lebanon" → Lebanon
"Smiles Dental - Milwaukie" → Milwaukie
"Smiles Dental - Riddle" → Riddle

Also check address if office name is unclear:
- "109 S 65th" → Ridgefield
- "1683 W Harvard Ave" → Roseburg

GL ACCOUNT GUIDANCE (Based on 120+ historical transactions):
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees

Location-Specific Assignments:
- General-Ridgefield: 52210 Dental Lab Fees (133 historical occurrences)
- General-Columbia: 52210 Dental Lab Fees (112 historical occurrences)
- General-Roseburg: 52210 Dental Lab Fees
- All other locations: 52210 Dental Lab Fees

CRITICAL: This is a DENTAL LAB - ALWAYS use "Dental Lab Fees" account.
NEVER use "Dental Supplies Inventory" - that's for supply vendors like Patterson.
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:

1. INVOICE NUMBER: Extract 4-digit number after "No."
   - "No. 5972" → "5972"

2. DATE CONVERSION: Convert M/DD/YYYY to YYYY-MM-DD
   - "11/17/2025" → "2025-11-17"
   - "8/28/2025" → "2025-08-28"

3. AMOUNT EXTRACTION:
   - Extract from "Total:" line at bottom
   - Remove dollar sign: "Total: $163.00" → 163.00

4. PATIENT NAME:
   - Extract the full name after "Patient:"
   - Keep in original format (usually uppercase)

5. LOCATION EXTRACTION:
   - Parse office name from "Ship To:" section
   - Extract location from "Smiles Dental - [Location]" format

6. LINE ITEMS:
   - Parse Description and Amount columns
   - Note tooth numbers if present (after #)
   - Note shade information if present

7. DISCOUNTS:
   - May appear as negative amounts or "Waived"
   - Example: "Loyal Customer Discount - Rush Fee Waived" with ($XX.00)

8. DOCUMENT TYPE:
   - These are always lab invoices
   - Simple single-page format
   - If significantly different format, may be a different document type

9. DUE DATE:
   - Calculate as Invoice Date + 30 days
   - Standard lab terms`;

try {
  const result = db.prepare(`
    UPDATE vendor_knowledge_bases 
    SET knowledge_prompt = ?, updated_at = datetime('now')
    WHERE vendor_name = ?
  `).run(prompt, 'Exodus Dental Solutions');
  
  console.log('✓ Exodus Dental Solutions updated:', result.changes, 'rows affected');
} catch (err) {
  console.error('Error:', err.message);
}

db.close();
