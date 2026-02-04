#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Hermann Sarmiento': `You are parsing invoices from Hermann Sarmiento.

VENDOR IDENTIFICATION:
- Primary Name: Hermann Sarmiento
- THIS IS AN INDIVIDUAL CONTRACTOR

INVOICE FORMAT:
Individual contractor invoice - format may vary.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #" (may not have one)
2. DATE: Look for date on invoice
3. TOTAL AMOUNT: Look for "Total", amount
4. SERVICE DESCRIPTION: Type of service performed

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services - categorize by service type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract any invoice/reference number
2. Parse date to YYYY-MM-DD
3. Use Total as amount`,

  'Crest+Oral-B': `You are parsing invoices from Crest+Oral-B.

VENDOR IDENTIFICATION:
- Primary Name: Crest+Oral-B
- Parent Company: Procter & Gamble
- THIS IS A DENTAL PRODUCT SUPPLIER - toothpaste, oral care products

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Product supplier invoice format.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #", "Order #"
2. INVOICE DATE: Look for "Invoice Date", "Order Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total", "Amount Due"
5. PRODUCTS: Oral care products, patient samples

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Oral care products - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/order number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Berman Fink Van Horn': `You are parsing invoices from Berman Fink Van Horn P.C.

VENDOR IDENTIFICATION:
NOTE: Same as "Berman Fink Van Horn P.C." - normalize vendor name.
- Primary Name: Berman Fink Van Horn P.C.
- Also appears as: Berman Fink Van Horn
- Normalize to: "Berman Fink Van Horn P.C."

See "Berman Fink Van Horn P.C." for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Professional Fees / Legal Expenses
Legal services - use Professional Fees
═══════════════════════════════════════════════════════════════════════════════`,

  'Bridgeford': `You are parsing invoices from Bridgeford.

VENDOR IDENTIFICATION:
- Primary Name: Bridgeford
- Also appears as: Bridgeford Legal
- THIS MAY BE RELATED TO: Legal services (Brit Young and Bridgeford Legal)

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Legal services invoice format.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date" or standard Net 30
4. TOTAL AMOUNT: Look for "Total"
5. SERVICES: Legal services, consulting

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Professional Fees / Legal Expenses
Legal services - use Professional Fees
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Preat Corporation': `You are parsing invoices from Preat Corporation.

VENDOR IDENTIFICATION:
- Primary Name: Preat Corporation
- THIS IS A DENTAL PRODUCTS COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Dental product invoice format.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Invoice Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total", "Invoice Total"
5. PRODUCTS: Dental supplies and equipment

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental products - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Brasseler USA': `You are parsing invoices from Brasseler USA.

VENDOR IDENTIFICATION:
- Primary Name: Brasseler USA
- Also appears as: Brasseler
- THIS IS A DENTAL INSTRUMENTS/BURS SUPPLIER

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Dental instruments invoice format.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Invoice Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total", "Invoice Total"
5. SHIP-TO: Office location
6. PRODUCTS: Burs, instruments, rotary tools

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental instruments - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Ship-to determines office`,

  'Dental Intelligence': `You are parsing invoices from Dental Intelligence.

VENDOR IDENTIFICATION:
- Primary Name: Dental Intelligence
- THIS IS A DENTAL ANALYTICS/SOFTWARE COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
SaaS subscription invoice format.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Invoice Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SUBSCRIPTION: Software/analytics service

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
Analytics software - use Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Note subscription period`,

  'Bonadent': `You are parsing invoices from Bonadent.

VENDOR IDENTIFICATION:
- Primary Name: Bonadent
- Also appears as: Bonadent Dental Laboratories
- THIS IS A DENTAL LAB - crowns, bridges, dentures

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Dental lab invoice format - similar to other labs.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #", "Case #"
2. INVOICE DATE: Look for "Invoice Date"
3. DUE DATE: Standard Net 30
4. TOTAL AMOUNT: Look for "Total"
5. PATIENT NAME: Patient case was made for
6. DOCTOR NAME: Ordering dentist
7. PRODUCTS: Crowns, bridges, dentures, implants

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
Dental lab - ALWAYS use Dental Lab Fees
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/case number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Track patient and doctor for case matching`,

  'Umpqua Valley Fire Services,Inc. dba A-1 Fire Protection': `You are parsing invoices from Umpqua Valley Fire Services, Inc. (A-1 Fire Protection).

VENDOR IDENTIFICATION:
- Primary Name: Umpqua Valley Fire Services, Inc.
- DBA: A-1 Fire Protection
- THIS IS A FIRE PROTECTION/EXTINGUISHER SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Fire protection service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SERVICES: Fire extinguisher service, inspections

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services
Fire protection - use Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'All Hands Interpreting Service ASL Professionals, LLC': `You are parsing invoices from All Hands Interpreting Service ASL Professionals, LLC.

VENDOR IDENTIFICATION:
- Primary Name: All Hands Interpreting Service ASL Professionals, LLC
- Also appears as: All Hands Interpreting, ASL Professionals
- THIS IS A SIGN LANGUAGE INTERPRETING SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar to other interpreting services (Signing Resources, Passport to Languages).

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Standard Net 30 or Due on Receipt
4. TOTAL AMOUNT: Look for "Total"
5. SERVICE DETAILS:
   - Service date
   - Patient/client name
   - Interpreter name
   - Hours/duration

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Professional Services
Interpreting service - use Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Track interpreter details`,

  "Heath's Laundry": `You are parsing invoices from Heath's Laundry.

VENDOR IDENTIFICATION:
- Primary Name: Heath's Laundry
- Also appears as: Heaths Laundry
- THIS IS A LAUNDRY/LINEN SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Laundry/linen service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SERVICES: Laundry, linens, uniforms

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
Laundry service - use Uniforms & Cleaning
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Culligan': `You are parsing invoices from Culligan.

VENDOR IDENTIFICATION:
- Primary Name: Culligan
- Also appears as: Culligan Water, Culligan - Portland-Albany
- THIS IS A WATER SERVICE/FILTRATION COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Water/filtration service invoice.

FIELD LOCATIONS:
1. INVOICE/ACCOUNT NUMBER: Look for "Account #", "Invoice #"
2. INVOICE DATE: Look for "Bill Date", "Statement Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total Due", "Amount Due"
5. SERVICE ADDRESS: Shows which office

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses
Water service - use Office Expenses
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract account/invoice number
2. Use bill/statement date
3. Use Total Due as amount
4. Service address determines office`,

  'Benco Dental': `You are parsing invoices from Benco Dental.

VENDOR IDENTIFICATION:
- Primary Name: Benco Dental
- THIS IS A DENTAL SUPPLY DISTRIBUTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar to Henry Schein and Patterson - dental supply invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Invoice Date"
3. DUE DATE: Standard Net 30
4. TOTAL AMOUNT: Look for "Total", "Invoice Total"
5. SHIP-TO: Office location
6. LINE ITEMS: Dental supplies

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory
Dental supplies - use Dental Supplies Inventory
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount
4. Ship-to determines office`,

  'Bio-Tek Medical, Inc.': `You are parsing invoices from Bio-Tek Medical, Inc.

VENDOR IDENTIFICATION:
NOTE: Same as "Bio-Tek Medical" - normalize vendor name.
- Primary Name: Bio-Tek Medical
- Also appears as: Bio-Tek Medical, Inc.

See "Bio-Tek Medical" for full detailed parsing instructions.

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases
Medical gas supplier - use Medical Gases expense
═══════════════════════════════════════════════════════════════════════════════`,

  'Linde Gas & Equipment Inc.': `You are parsing invoices from Linde Gas & Equipment Inc.

VENDOR IDENTIFICATION:
- Primary Name: Linde Gas & Equipment Inc.
- Also appears as: Linde, Linde Gas
- THIS IS A MEDICAL GAS SUPPLIER - N2O, O2, nitrogen

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Medical gas delivery invoice - similar to Industrial Source, Airgas.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #", "Invoice Number"
2. INVOICE DATE: Look for "Invoice Date"
3. DUE DATE: Standard Net 30
4. TOTAL AMOUNT: Look for "Total", "Amount Due"
5. DELIVERY LOCATION: Shows which office
6. GAS PRODUCTS:
   - Nitrous Oxide (N2O) cylinders
   - Oxygen (O2) cylinders
   - Cylinder rental/return tracking

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases
Medical gas supplier - ALWAYS use Medical Gases expense
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Sum gas + rental fees for total
4. Track cylinder deliveries/returns`,

  'TechEdge Patterson Technical Service': `You are parsing invoices from TechEdge Patterson Technical Service.

VENDOR IDENTIFICATION:
- Primary Name: TechEdge Patterson Technical Service
- Also appears as: TechEdge, Patterson TechEdge
- Affiliated with: Patterson Dental
- THIS IS AN EQUIPMENT SERVICE/REPAIR COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Equipment service and repair invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #", "Service Order #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SERVICE LOCATION: Which office was serviced
6. SERVICE DETAILS:
   - Equipment type
   - Work performed
   - Parts used
   - Labor hours

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53400 Equipment:53410 Equipment Repair & Maintenance
Equipment service - use Equipment Repair & Maintenance
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice/service order number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount (parts + labor)`,

  'NRC Service': `You are parsing invoices from NRC Service.

VENDOR IDENTIFICATION:
- Primary Name: NRC Service
- THIS IS A SERVICE COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Service invoice format.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services - categorize by service type
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'National Interpreting Service, Inc.': `You are parsing invoices from National Interpreting Service, Inc.

VENDOR IDENTIFICATION:
- Primary Name: National Interpreting Service, Inc.
- Also appears as: National Interpreting Service
- THIS IS AN INTERPRETING SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar to other interpreting services.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Standard Net 30 or Due on Receipt
4. TOTAL AMOUNT: Look for "Total"
5. SERVICE DETAILS: Date, patient, language, interpreter, hours

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Professional Services
Interpreting service - use Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  "Physician's Resource": `You are parsing invoices from Physician's Resource.

VENDOR IDENTIFICATION:
- Primary Name: Physician's Resource
- Also appears as: Physicians Resource
- THIS IS A MEDICAL SUPPLY/SERVICE VENDOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Medical/dental supply or service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #" (e.g., 031516)
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Dental Supplies or Contract Services depending on item
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Fyle, Inc.': `You are parsing invoices from Fyle, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Fyle, Inc.
- Also appears as: Fyle Inc
- THIS IS EXPENSE MANAGEMENT SOFTWARE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
SaaS subscription invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SUBSCRIPTION: Service period, number of users

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing
Software subscription - use Computer Software & Licensing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'TrustWorkz, Inc.': `You are parsing invoices from TrustWorkz, Inc.

VENDOR IDENTIFICATION:
- Primary Name: TrustWorkz, Inc.
- Also appears as: Trustworkz Inc, TrustWorkz
- THIS IS A MARKETING/DIGITAL SERVICES COMPANY

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Marketing services invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SERVICES: Marketing, digital advertising, website

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:54000 Other Expenses:54200 Advertising & Marketing:54210 Digital Marketing
Marketing services - use Advertising & Marketing
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'MedPro Waste Disposal, LLC': `You are parsing invoices from MedPro Waste Disposal, LLC.

VENDOR IDENTIFICATION:
- Primary Name: MedPro Waste Disposal, LLC
- Also appears as: MedPro Waste Disposal
- THIS IS MEDICAL WASTE DISPOSAL SERVICE

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Similar to Stericycle - medical waste pickup.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Standard Net 30
4. TOTAL AMOUNT: Look for "Total"
5. SERVICE LOCATION: Which office
6. WASTE DETAILS: Container, pickup date, manifest

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53225 Hazardous Disposal
Medical waste - use Hazardous Disposal
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`,

  'Otis Electric, LLC': `You are parsing invoices from Otis Electric, LLC.

VENDOR IDENTIFICATION:
- Primary Name: Otis Electric, LLC
- Also appears as: Otis Electric
- THIS IS AN ELECTRICAL CONTRACTOR

INVOICE FORMAT:
═══════════════════════════════════════════════════════════════════════════════
Electrical service invoice.

FIELD LOCATIONS:
1. INVOICE NUMBER: Look for "Invoice #"
2. INVOICE DATE: Look for "Date"
3. DUE DATE: Look for "Due Date"
4. TOTAL AMOUNT: Look for "Total"
5. SERVICES: Work performed, parts, labor

GL ACCOUNT GUIDANCE:
═══════════════════════════════════════════════════════════════════════════════
PRIMARY ACCOUNT: Contract Services or Repairs & Maintenance
Electrical service - use Contract Services
═══════════════════════════════════════════════════════════════════════════════

PARSING RULES:
1. Extract invoice number
2. Convert dates to YYYY-MM-DD
3. Use Total as amount`
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
