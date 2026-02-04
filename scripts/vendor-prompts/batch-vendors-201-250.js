#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  "Builder's Electric, Inc": `You are parsing invoices from Builder's Electric, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Builder's Electric, Inc
- THIS IS AN ELECTRICAL CONTRACTOR

INVOICE FORMAT: Electrical service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Repairs & Maintenance
═══════════════════════════════════════════════════════════════════════════════`,

  'Corsearch': `You are parsing invoices from Corsearch.

VENDOR IDENTIFICATION:
- Primary Name: Corsearch
- THIS IS A TRADEMARK SEARCH SERVICE

INVOICE FORMAT: Professional services invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Professional Fees / Legal Expenses
═══════════════════════════════════════════════════════════════════════════════`,

  'Smiles Dental': `You are parsing invoices from Smiles Dental.

VENDOR IDENTIFICATION:
- Primary Name: Smiles Dental
- NOTE: This may be internal/inter-company

SPECIAL HANDLING:
FLAG FOR REVIEW - may be internal transfer

GL ACCOUNT GUIDANCE:
REVIEW REQUIRED - internal/related party
═══════════════════════════════════════════════════════════════════════════════`,

  'Cintas': `You are parsing invoices from Cintas.

VENDOR IDENTIFICATION:
- Primary Name: Cintas
- Also appears as: Cintas Corporation
- THIS IS A UNIFORM/LINEN/FACILITY SERVICE

INVOICE FORMAT: Recurring service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SERVICE: Uniforms, linens, facility services

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53224 Uniforms & Cleaning
═══════════════════════════════════════════════════════════════════════════════`,

  'Ctrl+Alt+IT': `You are parsing invoices from Ctrl+Alt+IT.

VENDOR IDENTIFICATION:
- Primary Name: Ctrl+Alt+IT
- THIS IS AN IT SERVICE/SUPPORT COMPANY

INVOICE FORMAT: IT services invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"
5. SERVICES: IT support, computer services

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════`,

  'Jan-Pro': `You are parsing invoices from Jan-Pro.

VENDOR IDENTIFICATION:
- Primary Name: Jan-Pro
- Also appears as: JanPro
- THIS IS A CLEANING/JANITORIAL SERVICE

INVOICE FORMAT: Cleaning service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53224 Uniforms & Cleaning
═══════════════════════════════════════════════════════════════════════════════`,

  'StatDDS': `You are parsing invoices from StatDDS.

VENDOR IDENTIFICATION:
- Primary Name: StatDDS
- THIS IS A DENTAL SOFTWARE/ANALYTICS COMPANY

INVOICE FORMAT: SaaS subscription invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"
5. SUBSCRIPTION: Software service

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════`,

  'Zima International, Inc.': `You are parsing invoices from Zima International, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Zima International, Inc.
- THIS IS A DENTAL LAB

INVOICE FORMAT: Dental lab invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #", "Case #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"
5. PRODUCTS: Dental restorations

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
═══════════════════════════════════════════════════════════════════════════════`,

  'Procter & Gamble': `You are parsing invoices from Procter & Gamble.

VENDOR IDENTIFICATION:
- Primary Name: Procter & Gamble
- Also appears as: P&G
- THIS IS A CONSUMER PRODUCTS COMPANY (Crest, Oral-B parent)

INVOICE FORMAT: Product supplier invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory (for dental products)
═══════════════════════════════════════════════════════════════════════════════`,

  "A-J's Painting & More LLC": `You are parsing invoices from A-J's Painting & More LLC.

VENDOR IDENTIFICATION:
- Primary Name: A-J's Painting & More LLC
- THIS IS A PAINTING/MAINTENANCE CONTRACTOR

INVOICE FORMAT: Contractor invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Repairs & Maintenance
═══════════════════════════════════════════════════════════════════════════════`,

  'A1 Professional Exterminating': `You are parsing invoices from A1 Professional Exterminating.

VENDOR IDENTIFICATION:
NOTE: Same as "A-1 Professional Exterminating" - normalize vendor name.

See "A-1 Professional Exterminating" for detailed parsing instructions.

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services (pest control)
═══════════════════════════════════════════════════════════════════════════════`,

  'Abby Losee': `You are parsing invoices from Abby Losee.

VENDOR IDENTIFICATION:
- Primary Name: Abby Losee
- THIS IS AN INDIVIDUAL CONTRACTOR

INVOICE FORMAT: Individual contractor invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. DATE: Look for date
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services - categorize by service type
═══════════════════════════════════════════════════════════════════════════════`,

  'ABC Fire Extinguisher, Inc': `You are parsing invoices from ABC Fire Extinguisher, Inc.

VENDOR IDENTIFICATION:
- Primary Name: ABC Fire Extinguisher, Inc
- THIS IS A FIRE PROTECTION SERVICE

INVOICE FORMAT: Fire protection service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services (fire protection)
═══════════════════════════════════════════════════════════════════════════════`,

  'Adobe': `You are parsing invoices from Adobe.

VENDOR IDENTIFICATION:
- Primary Name: Adobe
- Also appears as: Adobe Inc, Adobe Systems
- THIS IS A SOFTWARE COMPANY

INVOICE FORMAT: SaaS subscription invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"
5. SUBSCRIPTION: Creative Cloud, Acrobat, etc.

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════`,

  'ADT Security Services': `You are parsing invoices from ADT Security Services.

VENDOR IDENTIFICATION:
- Primary Name: ADT Security Services
- Also appears as: ADT, Adt
- THIS IS A SECURITY MONITORING SERVICE

INVOICE FORMAT: Monthly security service invoice.

FIELD LOCATIONS:
1. ACCOUNT NUMBER: Look for "Account #"
2. INVOICE DATE: Look for "Statement Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total Due"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services
═══════════════════════════════════════════════════════════════════════════════`,

  'Aetna': `You are parsing invoices from Aetna.

VENDOR IDENTIFICATION:
- Primary Name: Aetna
- Also appears as: Aetna Inc
- THIS IS A HEALTH INSURANCE COMPANY

INVOICE FORMAT: Insurance premium statement.

FIELD LOCATIONS:
1. STATEMENT NUMBER: Look for "Statement #"
2. STATEMENT DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total Due"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor:51200 Employee Benefits:51210 Health Insurance
═══════════════════════════════════════════════════════════════════════════════`,

  'Affordable Tile and Roofing': `You are parsing invoices from Affordable Tile and Roofing.

VENDOR IDENTIFICATION:
- Primary Name: Affordable Tile and Roofing
- THIS IS A ROOFING/CONSTRUCTION CONTRACTOR

INVOICE FORMAT: Contractor invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Repairs & Maintenance or Contract Services
═══════════════════════════════════════════════════════════════════════════════`,

  'All Hands Interpreting Services': `You are parsing invoices from All Hands Interpreting Services.

VENDOR IDENTIFICATION:
NOTE: Same as "All Hands Interpreting Service ASL Professionals, LLC"

See "All Hands Interpreting Service ASL Professionals, LLC" for detailed instructions.

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services (interpreting)
═══════════════════════════════════════════════════════════════════════════════`,

  'Alora Mason': `You are parsing invoices from Alora Mason.

VENDOR IDENTIFICATION:
- Primary Name: Alora Mason
- THIS IS AN INDIVIDUAL CONTRACTOR

INVOICE FORMAT: Individual contractor invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. DATE: Look for date
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Direct Labor - categorize by service
═══════════════════════════════════════════════════════════════════════════════`,

  'Althea Seloover': `You are parsing invoices from Althea Seloover.

VENDOR IDENTIFICATION:
- Primary Name: Althea Seloover
- THIS IS AN INDIVIDUAL CONTRACTOR

INVOICE FORMAT: Individual contractor invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. DATE: Look for date
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Direct Labor - categorize by service
═══════════════════════════════════════════════════════════════════════════════`,

  'Amazon': `You are parsing invoices from Amazon.

VENDOR IDENTIFICATION:
- Primary Name: Amazon
- Also appears as: Amazon.com, Amazon Business
- THIS IS AN E-COMMERCE RETAILER

INVOICE FORMAT: Order invoice/receipt.

FIELD LOCATIONS:
1. ORDER NUMBER: Look for "Order #"
2. ORDER DATE: Look for "Order Date"
3. TOTAL AMOUNT: Look for "Grand Total", "Order Total"
5. ITEMS: Various supplies

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Office Expenses or Dental Supplies - depends on items purchased
═══════════════════════════════════════════════════════════════════════════════`,

  'American Backflow & Plumbing Services, Inc': `You are parsing invoices from American Backflow & Plumbing Services, Inc.

VENDOR IDENTIFICATION:
- Primary Name: American Backflow & Plumbing Services, Inc
- THIS IS A PLUMBING/BACKFLOW TESTING SERVICE

INVOICE FORMAT: Service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Repairs & Maintenance
═══════════════════════════════════════════════════════════════════════════════`,

  'American Express': `You are parsing invoices from American Express.

VENDOR IDENTIFICATION:
- Primary Name: American Express
- Also appears as: Amex
- THIS IS A CREDIT CARD COMPANY

INVOICE FORMAT: Credit card statement.

FIELD LOCATIONS:
1. ACCOUNT NUMBER: Look for "Account #" (masked)
2. STATEMENT DATE: Look for "Statement Date"
3. DUE DATE: Look for "Payment Due Date"
4. TOTAL AMOUNT: Look for "New Balance", "Total Due"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Varies by charges - review statement details
═══════════════════════════════════════════════════════════════════════════════`,

  'American Logo Gear LLC': `You are parsing invoices from American Logo Gear LLC.

VENDOR IDENTIFICATION:
- Primary Name: American Logo Gear LLC
- THIS IS A PROMOTIONAL PRODUCTS COMPANY

INVOICE FORMAT: Product invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:54000 Other Expenses:54200 Advertising & Marketing
═══════════════════════════════════════════════════════════════════════════════`,

  'Amigos Capital': `You are parsing invoices from Amigos Capital.

VENDOR IDENTIFICATION:
- Primary Name: Amigos Capital
- THIS MAY BE A FINANCING/CAPITAL COMPANY

INVOICE FORMAT: Financing/payment invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total", "Payment Amount"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Review invoice for proper categorization
═══════════════════════════════════════════════════════════════════════════════`,

  'Andrea Trotter': `You are parsing invoices from Andrea Trotter.

VENDOR IDENTIFICATION:
- Primary Name: Andrea Trotter
- THIS IS AN INDIVIDUAL CONTRACTOR

INVOICE FORMAT: Individual contractor invoice.

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Direct Labor - categorize by service
═══════════════════════════════════════════════════════════════════════════════`,

  'Angela Garretson_': `You are parsing invoices from Angela Garretson.

VENDOR IDENTIFICATION:
- Primary Name: Angela Garretson
- THIS IS AN INDIVIDUAL CONTRACTOR

INVOICE FORMAT: Individual contractor invoice.

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Direct Labor - categorize by service
═══════════════════════════════════════════════════════════════════════════════`,

  'APEX Dental Analytics': `You are parsing invoices from APEX Dental Analytics.

VENDOR IDENTIFICATION:
- Primary Name: APEX Dental Analytics
- THIS IS A DENTAL ANALYTICS/SOFTWARE COMPANY

INVOICE FORMAT: SaaS subscription invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════`,

  'Apple': `You are parsing invoices from Apple.

VENDOR IDENTIFICATION:
- Primary Name: Apple
- Also appears as: Apple Inc
- THIS IS A TECHNOLOGY COMPANY

INVOICE FORMAT: Product/subscription invoice.

FIELD LOCATIONS:
1. ORDER NUMBER: Look for "Order #"
2. DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Equipment or Computer Software depending on purchase
═══════════════════════════════════════════════════════════════════════════════`,

  'ASL Interpreters': `You are parsing invoices from ASL Interpreters.

VENDOR IDENTIFICATION:
- Primary Name: ASL Interpreters
- THIS IS A SIGN LANGUAGE INTERPRETING SERVICE

See other interpreting services for similar format.

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services (interpreting)
═══════════════════════════════════════════════════════════════════════════════`,

  'Assure Hire Inc': `You are parsing invoices from Assure Hire Inc.

VENDOR IDENTIFICATION:
- Primary Name: Assure Hire Inc
- THIS IS A BACKGROUND CHECK/HR SERVICE

INVOICE FORMAT: HR services invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or HR Expenses
═══════════════════════════════════════════════════════════════════════════════`,

  'Atrio Health Plans': `You are parsing invoices from Atrio Health Plans.

VENDOR IDENTIFICATION:
- Primary Name: Atrio Health Plans
- THIS IS A HEALTH INSURANCE COMPANY

INVOICE FORMAT: Insurance premium statement.

FIELD LOCATIONS:
1. STATEMENT NUMBER: Look for "Statement #"
2. DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total Due"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:51000 Direct Labor:51200 Employee Benefits:51210 Health Insurance
═══════════════════════════════════════════════════════════════════════════════`,

  'Avista': `You are parsing invoices from Avista.

VENDOR IDENTIFICATION:
- Primary Name: Avista
- Also appears as: Avista Utilities
- THIS IS A UTILITY COMPANY (gas, electric)

INVOICE FORMAT: Utility bill.

FIELD LOCATIONS:
1. ACCOUNT NUMBER: Look for "Account #"
2. BILL DATE: Look for "Statement Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total Due", "Amount Due"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53130 Utilities
═══════════════════════════════════════════════════════════════════════════════`,

  'Miracle Cleaners': `You are parsing invoices from Miracle Cleaners.

VENDOR IDENTIFICATION:
- Primary Name: Miracle Cleaners
- THIS IS A DRY CLEANING/LAUNDRY SERVICE

INVOICE FORMAT: Dry cleaning receipt - often scanned.

FIELD LOCATIONS:
1. RECEIPT NUMBER: Look for receipt #
2. DATE: Look for date
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53224 Uniforms & Cleaning
═══════════════════════════════════════════════════════════════════════════════`,

  'USPS': `You are parsing invoices from USPS.

VENDOR IDENTIFICATION:
- Primary Name: USPS
- Also appears as: United States Postal Service
- THIS IS POSTAGE/MAILING

INVOICE FORMAT: Postal receipt.

FIELD LOCATIONS:
1. RECEIPT NUMBER: Look for receipt/transaction #
2. DATE: Look for date
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53221 Postage & Shipping
═══════════════════════════════════════════════════════════════════════════════`,

  'Patterson Dental Supply, Inc.': `You are parsing invoices from Patterson Dental Supply, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Patterson Dental Supply, Inc.
- Also appears as: Patterson Dental, Patterson
- THIS IS A MAJOR DENTAL SUPPLY DISTRIBUTOR

See "Patterson Dental" for detailed format (previously created).

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════`,

  'Marion Environmental Services': `You are parsing invoices from Marion Environmental Services.

VENDOR IDENTIFICATION:
- Primary Name: Marion Environmental Services
- THIS IS A WASTE/ENVIRONMENTAL SERVICE

INVOICE FORMAT: Environmental service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
PRIMARY ACCOUNT: Contract Services or Hazardous Disposal
═══════════════════════════════════════════════════════════════════════════════`
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
