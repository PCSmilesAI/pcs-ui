#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
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
   - Format: Long numeric

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

  'Passport to Languages Inc.': `You are parsing invoices from Passport to Languages Inc.

VENDOR IDENTIFICATION:
- Primary Name: Passport to Languages Inc.
- Address: 3912 SW 43rd Ave, Portland, OR 97221-3709
- Phone: 503-297-2707, Fax: 503-297-1703
- Cost Code: 631-85902-769320
- Tax ID: 90-0738289
- THIS IS AN INTERPRETING SERVICE - medical/dental interpretation

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Position: Top right, "INVOICE NUMBER:"
   - Format: 7-digit (e.g., 1206074)

2. INVOICE DATE:
   - Position: Top right, "INVOICE DATE:"
   - Format: M/DD/YYYY (e.g., 9/17/2025)

3. DUE DATE:
   - Note: "PAYMENT DUE 30 DAYS UPON RECEIPT"
   - Calculate: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Position: "TOTAL DUE:" at bottom right
   - Format: Dollar amount (e.g., $45.00)

5. SERVICE LOCATION:
   - Position: Bill-to address shows office

6. APPOINTMENT DETAILS:
   - APPT#: Appointment number
   - DATE: Service date
   - CLAIMANT NAME: Patient name
   - LANGUAGE: Language interpreted
   - INTERPRETER NAME: Interpreter used
   - MINS: Duration in minutes

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Professional Services expense
Interpreting service
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract 7-digit invoice number
2. Convert M/DD/YYYY to YYYY-MM-DD
3. Use "TOTAL DUE" as amount
4. Note appointment and interpreter details`,

  'Stericycle, Inc.': `You are parsing invoices from Stericycle, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Stericycle, Inc.
- Tax ID: 36-3640402
- Customer Service: 1-866-783-7422
- Website: www.stericycle.com, MyStericycle.com
- THIS IS A MEDICAL WASTE DISPOSAL SERVICE - regulated medical waste, sharps

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

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
2. Use MM-DD-YYYY date format
3. Use "Total Invoice Charges" as amount
4. Note: May show "Scheduled for auto-pay"
5. Site# indicates service location`,

  'onDiem': `You are parsing invoices from onDiem (Gig Forces Inc.).

VENDOR IDENTIFICATION:
- Primary Name: onDiem
- Legal/Payment Entity: Gig Forces Inc.
- Address: P.O. Box 340749, Tampa, FL 33694
- Phone: (855) 680-0701
- Support: support@onDiem.com
- THIS IS A TEMP STAFFING SERVICE - dental temp workers

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════

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
Direct Labor for temp workers or Contract Services for staffing agency fees
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract alphanumeric invoice hash
2. Convert "Month DD, YYYY" to YYYY-MM-DD
3. Use Subtotal + Processing fee as total
4. Note: Payment to "Gig Forces Inc." not "onDiem"`,

  'Gig Forces Inc.': `You are parsing invoices from onDiem (Gig Forces Inc.).

VENDOR IDENTIFICATION:
NOTE: This is the same vendor as "onDiem" - normalize vendor name.
- Primary Name: onDiem
- Also appears as: Gig Forces Inc., OnDeim
- Normalize to: "onDiem"

See "onDiem" for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
Temp staffing service - use Direct Labor or Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Normalize vendor name to "onDiem"
2. Follow onDiem format`
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
