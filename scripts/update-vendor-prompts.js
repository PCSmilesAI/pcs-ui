#!/usr/bin/env node
/**
 * Script to update vendor knowledge base prompts with detailed, unique instructions
 * for each vendor based on invoice format analysis and historical GL data
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Load GL account mappings
const glMappingsPath = path.join(__dirname, '..', 'config', 'qbo_vendor_categories.json');
let glMappings = [];
try {
  glMappings = JSON.parse(fs.readFileSync(glMappingsPath, 'utf-8'));
} catch (e) {
  console.error('Warning: Could not load GL mappings:', e.message);
}

// Helper function to get GL account info for a vendor
function getVendorGLAccounts(vendorName) {
  const normalized = vendorName.toLowerCase().trim();
  const matches = glMappings.filter(m => 
    m.vendor && m.vendor.toLowerCase().includes(normalized) ||
    normalized.includes(m.vendor?.toLowerCase() || '')
  );
  
  // Group by account and class
  const accounts = {};
  matches.forEach(m => {
    if (m.accountFullName && !m.accountFullName.includes('Accounts Payable') && !m.accountFullName.includes('Cash and Cash')) {
      const key = m.accountFullName;
      if (!accounts[key]) {
        accounts[key] = { account: key, classes: [], totalCount: 0 };
      }
      accounts[key].totalCount += m.count || 0;
      if (m.class) {
        accounts[key].classes.push({ class: m.class, count: m.count || 0 });
      }
    }
  });
  
  return Object.values(accounts).sort((a, b) => b.totalCount - a.totalCount);
}

// Define vendor prompts
const vendorPrompts = {
  'Patterson Dental': `You are parsing invoices from Patterson Dental Supply, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Patterson Dental Supply, Inc.
- Also appears as: Patterson Dental, Patterson
- The vendor name appears in the header area with address showing "Patterson Dental Supply, Inc." followed by a branch location

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Label: "Invoice" followed by the number
   - Location: Right side of header, near "Reference Number" row
   - Format: Numeric, typically 10 digits (e.g., 3037868506)

2. INVOICE DATE:
   - Label: "Date:"
   - Location: Right side header section
   - Format: YYYY-MM-DD (e.g., 2025-07-11)

3. DUE DATE:
   - Label: "Payment Terms"
   - Location: Top section, shows "Net Due 30 Days from Inv. Date"
   - Calculate: Invoice Date + 30 days

4. TOTAL AMOUNT:
   - Label: "Total"
   - Location: Bottom right of line items section
   - Format: Dollar sign with decimal (e.g., $ 259.00)

5. SHIP-TO / OFFICE LOCATION:
   - Section: "SHIP TO" (vertical text on left side)
   - Common locations: PC SMILES RIDDLE, PC SMILES ROSEBURG, PC SMILES EUGENE, PC SMILES SALEM, PC SMILES LEBANON, PC SMILES MILWAUKIE, PC SMILES COLUMBIA, PC SMILES RIDGEFIELD
   - Extract the city name for location

6. LINE ITEMS:
   - Table Headers: Conf. Date | Conf. No. | Product No. | Description | Quantity | Unit | Unit Price | Amount | Tax

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- This vendor sells dental supplies - always categorize to Dental Supplies Inventory
- Location-specific: Use the Ship-To location to determine the class (General-Riddle, General-Roseburg, etc.)

PARSING RULES:
- Invoices are typically 1-2 pages
- If document says "STATEMENT", classify as Other Document (statement type)
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Henry Schein': `You are parsing invoices from Henry Schein, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Henry Schein, Inc.
- Also appears as: Henry Schein
- NOTE: "Henry Schein One" is a DIFFERENT company (software, not supplies) - do not confuse them
- Invoice header shows "INVOICE" prominently at top left

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Label: "Invoice#"
   - Location: Top section, right side - appears multiple times on page
   - Format: 8 digits (e.g., 43912059)

2. INVOICE DATE:
   - Label: "Invoice Date"
   - Location: Adjacent to Invoice# in top section
   - Format: MM/DD/YY (e.g., 07/10/25)

3. DUE DATE:
   - Label: "Due Date"
   - Location: Next to Invoice Date
   - Format: MM/DD/YY (e.g., 08/09/25)

4. TOTAL AMOUNT:
   - Label: "Invoice Total"
   - Location: Top right header AND bottom summary section
   - Format: Dollar sign with decimal (e.g., $396.87)
   - Also shows: MERCHANDISE TOTAL, FREIGHT CHARGES, INVOICE TOTAL breakdown at bottom

5. SHIP-TO / OFFICE LOCATION:
   - Section: "Ship/Sold-To:" with customer number
   - Location: Top left area, shows "Smiles Dental [Location]"
   - Also check "PO#" field which often contains location (e.g., "Riddle-General")
   - Common locations: Smiles Dental Riddle, Smiles Dental Roseburg, Smiles Dental Eugene, etc.

6. LINE ITEMS:
   - Table Headers: LINE NO. | ITEM CODE | UNIT SIZE | DESCRIPTION | QTY ORDERED | QTY SHIPPED | CODES | UNIT PRICE | EXT. PRICE | BOX NO. | SHIP FROM
   - Line items numbered sequentially

7. BILL-TO:
   - Label: "Bill-To:" with customer number
   - Shows: Pacific Crest Smiles, 1683 W Harvard Ave, ATTN: Accounts Payable

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Location breakdown by Ship-To address:
  * General-Roseburg: 10210 Dental Supplies Inventory (63 occurrences)
  * General-Eugene: 10210 Dental Supplies Inventory (37 occurrences)
  * All other locations: 10210 Dental Supplies Inventory

PARSING RULES:
- Multi-page invoices common - look for "Page X of Y" at bottom
- Line items may continue across pages
- ** SPECIAL CONTRACT PRICE ** notations are informational
- FREIGHT CHARGES should be included in total
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Exodus Dental Solutions': `You are parsing invoices from Exodus Dental Solutions.

VENDOR IDENTIFICATION:
- Primary Name: Exodus Dental Solutions
- Address: 701 NE 136th Ave, Suite 200, Vancouver, WA 98684
- Phone: 1844.396.3871 ext 3
- This is a DENTAL LAB - they provide lab work (crowns, dentures, etc.)

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Label: "No." (simple format)
   - Location: Top right, next to "INVOICE" header
   - Format: 4-digit number (e.g., 4307)

2. INVOICE DATE:
   - Label: No explicit label - date appears below invoice number
   - Location: Top right, under invoice number
   - Format: M/DD/YYYY (e.g., 6/14/2025)

3. DUE DATE:
   - NOT explicitly shown on invoice
   - Typically: Invoice Date + 30 days (standard terms)

4. TOTAL AMOUNT:
   - Label: "Total:"
   - Location: Bottom of invoice, after all line items
   - Format: Dollar sign with decimal (e.g., $363.00)

5. SHIP-TO / OFFICE LOCATION:
   - Section: "Ship To:"
   - Location: Below vendor address
   - Shows: Office name, contact person, address, phone
   - Common: "Smiles Dental - Ridgefield", "Smiles Dental - Columbia"
   - May include contact person name (e.g., Ryan Bohnstedt)

6. PATIENT NAME:
   - Label: "Patient:"
   - Location: Below Ship To section
   - Important: This is lab work - always has patient name

7. LINE ITEMS:
   - Simple two-column format: Description | Amount
   - Items include: P/ Package Finish Direct, Single Anterior, Wire Clasp, Duplicate Model, Rush fees, Discounts
   - Discounts shown as negative amounts

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
- Location breakdown:
  * General-Ridgefield: 52210 Dental Lab Fees (133 occurrences)
  * General-Columbia: 52210 Dental Lab Fees (112 occurrences)
- This is a dental lab - ALWAYS use Lab Fees account, never Dental Supplies Inventory

PARSING RULES:
- Simple single-page invoices
- Patient name is important for matching to patient records
- Discounts may be applied (shown as negative amounts or "Waived")
- This is LAB WORK not supplies - categorize appropriately
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Darby Dental Supply': `You are parsing invoices from Darby Dental Supply, LLC.

VENDOR IDENTIFICATION:
- Primary Name: Darby Dental Supply, LLC
- Also appears as: Darby Dental, darby
- This is a dental SUPPLIES distributor (similar to Patterson/Henry Schein)

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #", "Invoice Number", or "Inv #"
   - Location: Top right of invoice header
   - Format: Alphanumeric

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"
   - Location: Header section near invoice number
   - Format: MM/DD/YYYY

3. DUE DATE:
   - Label: "Due Date" or "Payment Due"
   - May show payment terms instead (Net 30)

4. TOTAL AMOUNT:
   - Label: "Total", "Amount Due", or "Invoice Total"
   - Location: Bottom right of invoice
   - Format: Dollar amount with decimal

5. SHIP-TO / OFFICE LOCATION:
   - Section: "Ship To" or "Deliver To"
   - Shows dental office name and address
   - Look for: Smiles Dental, Pacific Crest Smiles, or PC Smiles followed by location

6. LINE ITEMS:
   - Product table with descriptions, quantities, prices
   - May include SKU/product codes

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Location breakdown:
  * General-Lebanon: 10210 Dental Supplies Inventory (7 occurrences)
  * General-Roseburg: 10210 Dental Supplies Inventory (6 occurrences)
  * Other locations: 10210 Dental Supplies Inventory
- This vendor sells dental supplies - categorize to Dental Supplies Inventory

PARSING RULES:
- Standard dental supply invoice format
- If document says "STATEMENT", classify as Other Document
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Dandy': `You are parsing invoices from Dandy.

VENDOR IDENTIFICATION:
- Primary Name: Dandy
- This is a DENTAL LAB specializing in digital dentistry and lab services

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Date" or "Invoice Date"
   - Location: Near invoice number

3. DUE DATE:
   - May be explicitly shown or implied by payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"
   - Location: Bottom of invoice

5. SHIP-TO / OFFICE LOCATION:
   - Shows dental office receiving the lab work
   - Look for Smiles Dental or Pacific Crest Smiles locations

6. PATIENT NAME:
   - Dental lab invoices typically include patient name
   - Important for matching to patient records

6. LINE ITEMS:
   - Lab work descriptions (crowns, dentures, etc.)
   - May include case/patient references

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
- Location breakdown:
  * General-Milwaukie: 52210 Dental Lab Fees (10 occurrences)
  * General-Columbia: 52210 Dental Lab Fees (6 occurrences)
  * Other locations: 52210 Dental Lab Fees
- This is a dental lab - ALWAYS use Lab Fees account

PARSING RULES:
- Modern/digital format invoice
- May include digital case references
- This is LAB WORK not supplies
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Ultradent Products Inc': `You are parsing invoices from Ultradent Products Inc.

VENDOR IDENTIFICATION:
- Primary Name: Ultradent Products Inc
- Also appears as: Ultradent
- This is a dental products manufacturer (whitening, bonding agents, etc.)

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Top right header

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"
   - Location: Header section

3. DUE DATE:
   - Label: "Due Date" or payment terms shown

4. TOTAL AMOUNT:
   - Label: "Total", "Amount Due", "Invoice Total"
   - Location: Bottom right

5. SHIP-TO / OFFICE LOCATION:
   - Section: "Ship To"
   - Shows dental office name and address

6. LINE ITEMS:
   - Product details with item numbers
   - Includes whitening products, bonding agents, etc.

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Location breakdown:
  * General-Salem: 10210 Dental Supplies Inventory (4 occurrences)
  * Other locations: 10210 Dental Supplies Inventory
- Dental supplies manufacturer - use Dental Supplies Inventory

PARSING RULES:
- Standard product invoice format
- May include promotional pricing
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Miracle Cleaners': `You are parsing invoices from Miracle Cleaners.

VENDOR IDENTIFICATION:
- Primary Name: Miracle Cleaners
- This is a LAUNDRY/CLEANING service provider

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Date" or "Invoice Date"

3. DUE DATE:
   - May show payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"
   - Location: Bottom of invoice

5. SERVICE LOCATION:
   - Shows which office received cleaning services
   - Look for office name/address

6. LINE ITEMS:
   - Cleaning/laundry services
   - May include uniform cleaning, linen service, etc.

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
- Location breakdown:
  * General-Ridgefield: 53224 Uniforms & Cleaning (44 occurrences)
  * General-Columbia: 53224 Uniforms & Cleaning (43 occurrences)
- Cleaning service - use Uniforms & Cleaning expense account

PARSING RULES:
- Service invoice format
- May be recurring/monthly billing
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Linde Gas & Equipment Inc': `You are parsing invoices from Linde Gas & Equipment Inc.

VENDOR IDENTIFICATION:
- Primary Name: Linde Gas & Equipment Inc
- Also appears as: Linde Gas
- This is a MEDICAL GAS supplier (nitrous oxide, oxygen)

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"
   - Location: Bottom of invoice

5. DELIVERY LOCATION:
   - Shows which office received gas delivery
   - Look for office name/address

6. LINE ITEMS:
   - Gas products (N2O, O2, cylinder rentals)
   - May include cylinder deposits/returns

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases
- Location breakdown:
  * General-Columbia: 52120 Medical Gases (10 occurrences)
  * Other locations: 52120 Medical Gases
- Medical gas supplier - ALWAYS use Medical Gases account

PARSING RULES:
- May include cylinder rental charges
- Delivery/pickup information important
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Crystal Falls': `You are parsing invoices from Crystal Falls.

VENDOR IDENTIFICATION:
- Primary Name: Crystal Falls
- This is likely a water/beverage delivery service

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or standard invoice identifier
   - Location: Header area

2. INVOICE DATE:
   - Label: "Date" or "Invoice Date"

3. DUE DATE:
   - May show payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. DELIVERY LOCATION:
   - Shows which office received delivery
   - Look for office name/address

6. LINE ITEMS:
   - Water/beverage products
   - Cooler rental if applicable

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses
- Location breakdown:
  * General-Roseburg: 53220 Office Expenses (11 occurrences)
  * Other locations: 53220 Office Expenses
- Office expense - water/beverage service

PARSING RULES:
- Service/delivery invoice
- May be recurring monthly
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Kettenbach LP': `You are parsing invoices from Kettenbach LP.

VENDOR IDENTIFICATION:
- Primary Name: Kettenbach LP
- Also appears as: Kettenbach, Kettenbach Dental
- This is a dental SUPPLIES manufacturer (impression materials)

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #", "Invoice Number", "Document #"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SHIP-TO LOCATION:
   - Shows which office received order
   - Look for office name/address

6. LINE ITEMS:
   - Dental materials (impression materials, etc.)
   - Product codes and descriptions

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Location breakdown:
  * General-Roseburg: 10210 Dental Supplies Inventory (21 occurrences)
  * Other locations: 10210 Dental Supplies Inventory
- Dental supplies - use Dental Supplies Inventory

PARSING RULES:
- Standard product invoice format
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'TC Dental Laboratory, Inc.': `You are parsing invoices from TC Dental Laboratory, Inc.

VENDOR IDENTIFICATION:
- Primary Name: TC Dental Laboratory, Inc.
- Also appears as: TC Dental Lab, TC Dental
- Address: 1000 NE 122nd Ave, Portland, OR 97230
- Phone: 1 (800) 926-5412 / 503-254-1957
- This is a DENTAL LAB

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Label: "Invoice Number:" or shown in header
   - Location: Top area, may also appear as "Account #" reference
   - Format: Typically alphanumeric (e.g., 251-608)

2. INVOICE DATE:
   - Label: "Invoice Date:"
   - Location: Right side of header section
   - Format: M/DD/YYYY (e.g., 5/13/2025)

3. DUE DATE:
   - Label: "Due Date:"
   - Location: Below invoice date
   - Format: M/DD/YYYY (e.g., 5/15/2025)

4. TOTAL AMOUNT:
   - Label: "SUB TOTAL" (note: no separate tax typically)
   - Location: Bottom right of line items
   - Format: Dollar sign with decimal (e.g., $ 267.00)

5. SHIP-TO / OFFICE LOCATION:
   - Section: "Invoice To"
   - Location: Left side, shows office name and address
   - Example: "Smiles Dental (Salem, OR)", "2245 Mission Street, Suite 100"
   - Office in parentheses indicates location

6. DOCTOR NAME:
   - Label: "Doctor:"
   - Location: Header section
   - Important for lab work tracking

7. PATIENT NAME:
   - Label: "Patient:"
   - Location: Header section, after Doctor
   - Essential for matching lab work to patient

8. TOOTH/CASE INFO:
   - Labels: "ToothNumber:", "Shade:", "Ship Date:"
   - Location: Header section
   - Contains dental-specific case information

9. LINE ITEMS:
   - Table Headers: ITEM DESCRIPTION | QUANTITY | UNIT PRICE | TOTAL
   - Example items: "D2740 Full Zirconia Crown Posterior"
   - Includes dental procedure codes

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
- Location breakdown:
  * General-Salem: 52210 Dental Lab Fees (316 occurrences) - PRIMARY
  * General-Roseburg: 52210 Dental Lab Fees (73 occurrences)
  * Other locations: 52210 Dental Lab Fees
- This is a dental lab - ALWAYS use Lab Fees account

PARSING RULES:
- Lab invoices include patient and doctor information
- Extract tooth numbers for case tracking
- "D" codes are dental procedure codes
- Single page invoices typically
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Tc Dental Laboratory, Inc.': `You are parsing invoices from TC Dental Laboratory, Inc.

NOTE: This is the same vendor as "TC Dental Laboratory, Inc." - normalize to that name.

VENDOR IDENTIFICATION:
- Primary Name: TC Dental Laboratory, Inc.
- Also appears as: TC Dental Lab, TC Dental, Tc Dental Laboratory
- This is a DENTAL LAB

[Same detailed format as TC Dental Laboratory, Inc.]

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
- This is a dental lab - ALWAYS use Lab Fees account

PARSING RULES:
- Normalize vendor name to "TC Dental Laboratory, Inc."
- Lab invoices include patient and doctor information
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Brasseler': `You are parsing invoices from Brasseler USA.

VENDOR IDENTIFICATION:
- Primary Name: Brasseler USA
- Also appears as: Brasseler
- This is a dental instruments/burs manufacturer

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SHIP-TO LOCATION:
   - Shows which office received order
   - Look for office name/address

6. LINE ITEMS:
   - Dental instruments, burs, rotary instruments
   - Product codes and descriptions

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Location breakdown:
  * General-Roseburg: 10210 Dental Supplies Inventory (13 occurrences)
  * Other locations: 10210 Dental Supplies Inventory
- Dental instruments - use Dental Supplies Inventory

PARSING RULES:
- Standard product invoice format
- May include instrument set purchases
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Artisan Dental': `You are parsing invoices from Artisan Dental.

VENDOR IDENTIFICATION:
- Primary Name: Artisan Dental
- Account identifier: CN641911 (appears on invoices)
- Address: 2532 SE Hawthorne Blvd, Portland, OR 97214-3927
- Phone: 503/238-6006, 800/222-6721
- This is a DENTAL LAB

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Label: "INVOICE NO." column in header
   - Location: Top header row, rightmost column
   - Format: INxxxxxx (e.g., IN761993)

2. INVOICE DATE:
   - Label: "INVOICE DATE" column in header
   - Location: Header row, after SHADE column
   - Format: MM/DD/YYYY (e.g., 07/18/2025)

3. DUE DATE:
   - NOT explicitly shown
   - Standard terms: Invoice Date + 30 days
   - Note: Late charge warning mentions "30 days past due"

4. TOTAL AMOUNT:
   - Label: "TOTAL"
   - Location: Bottom right, after line items
   - Format: Dollar amount (e.g., 519.00)

5. BILL-TO / OFFICE LOCATION:
   - Location: Top left under vendor header
   - Shows: Office name and full address
   - Example: "PACIFIC CREST SMILES, 2245 Mission SE St, Suite 100, Salem OR 97302-1291"

6. PATIENT NAME:
   - Label: "PATIENT NAME" in header row
   - Location: First column of header
   - Example: "VEGA SOSA, GABRIELA"

7. ACCOUNT NUMBER:
   - Label: "ACCOUNT NO." in header row
   - Location: After patient name

8. SHADE:
   - Label: "SHADE" in header row
   - Dental shade for color matching

9. LINE ITEMS:
   - Table Headers: QUANTITY | MOULD & SHADE | SERVICE | DWT & GR. | AMOUNT
   - Example: "3.00 | 1185 | Z360 ANTERIOR | | 519.00"
   - Services include crown types, dentures, etc.

10. LATE CHARGE WARNING:
    - Location: Bottom of invoice
    - Note: "A penalty for late payment of 1-3/4% per month (21% per annum) will be added to all accounts 30 days past due"

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees
- Location breakdown:
  * General-Salem: 52210 Dental Lab Fees (151 occurrences) - PRIMARY
  * Other locations: 52210 Dental Lab Fees
- This is a dental lab - ALWAYS use Lab Fees account

PARSING RULES:
- Invoice format has horizontal header with columns
- Patient name in LASTNAME, FIRSTNAME format
- "Z360" and similar codes indicate crown/material types
- Single page invoices
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Maxxeus': `You are parsing invoices from Maxxeus.

VENDOR IDENTIFICATION:
- Primary Name: Maxxeus
- This is a dental supplies vendor

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SHIP-TO LOCATION:
   - Shows which office received order
   - Look for office name/address

6. LINE ITEMS:
   - Dental supplies and products
   - Product codes and descriptions

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Location breakdown:
  * General-Roseburg: 10210 Dental Supplies Inventory (primary)
- Dental supplies - use Dental Supplies Inventory

PARSING RULES:
- Standard product invoice format
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Heaths Laundry': `You are parsing invoices from Heaths Laundry.

VENDOR IDENTIFICATION:
- Primary Name: Heaths Laundry
- Also appears as: Heath's Laundry
- This is a LAUNDRY service provider

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Date" or "Invoice Date"

3. DUE DATE:
   - May show payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE LOCATION:
   - Shows which office received laundry services
   - Look for office name/address

6. LINE ITEMS:
   - Laundry services (uniform cleaning, linens)
   - May include pickup/delivery charges

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
- Location breakdown:
  * General-Lebanon: 53224 Uniforms & Cleaning (26 occurrences) - PRIMARY
  * Other locations: 53224 Uniforms & Cleaning
- Laundry service - use Uniforms & Cleaning expense

PARSING RULES:
- Service invoice format
- May be recurring/weekly billing
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Airgas USA LLC': `You are parsing invoices from Airgas USA LLC.

VENDOR IDENTIFICATION:
- Primary Name: Airgas USA LLC
- Also appears as: Airgas
- This is a MEDICAL GAS supplier

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. DELIVERY LOCATION:
   - Shows which office received gas delivery
   - Look for office name/address

6. LINE ITEMS:
   - Gas products (N2O, O2)
   - Cylinder rentals and returns

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases
- Location breakdown:
  * General-Roseburg: 52120 Medical Gases (9 occurrences)
  * Other locations: 52120 Medical Gases
- Medical gas supplier - use Medical Gases account

PARSING RULES:
- May include cylinder rental charges
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Fyle Inc': `You are parsing invoices from Fyle Inc.

VENDOR IDENTIFICATION:
- Primary Name: Fyle Inc
- Also appears as: Fyle
- This is a SOFTWARE/EXPENSE MANAGEMENT service

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"
   - Usually subscription-based billing

5. BILLING ENTITY:
   - Usually billed to corporate/finance

6. LINE ITEMS:
   - Software subscription fees
   - May include per-user pricing

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53330 IT Expenses:53334 Software
- Class: Corp-Finance (2 occurrences)
- Software expense - use IT Expenses:Software account

PARSING RULES:
- Software/SaaS invoice format
- Subscription-based billing
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Iron Mountain': `You are parsing invoices from Iron Mountain.

VENDOR IDENTIFICATION:
- Primary Name: Iron Mountain
- This is a DOCUMENT STORAGE/SHREDDING service

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE LOCATION:
   - Shows which office uses the service
   - Look for office name/address

6. LINE ITEMS:
   - Storage fees, shredding services
   - May include box counts

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53300 Overhead:53360 Services:53361 Contract Services
- Location breakdown:
  * General-Lebanon: 53361 Contract Services (2 occurrences)
  * Other locations: 53361 Contract Services
- Contract service expense

PARSING RULES:
- Service invoice format
- May be monthly recurring
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Oregon Linen': `You are parsing invoices from Oregon Linen.

VENDOR IDENTIFICATION:
- Primary Name: Oregon Linen
- This is a LINEN/LAUNDRY service provider

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Date" or "Invoice Date"

3. DUE DATE:
   - May show payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE LOCATION:
   - Shows which office received linen services
   - Look for office name/address

6. LINE ITEMS:
   - Linen rental/cleaning services
   - May include towels, gowns, etc.

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53224 Uniforms & Cleaning
- Location breakdown:
  * General-Roseburg: 53224 Uniforms & Cleaning (25 occurrences) - PRIMARY
  * Other locations: 53224 Uniforms & Cleaning
- Linen service - use Uniforms & Cleaning expense

PARSING RULES:
- Service invoice format
- May be recurring/weekly billing
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'MegaGen America': `You are parsing invoices from MegaGen America.

VENDOR IDENTIFICATION:
- Primary Name: MegaGen America
- Also appears as: MegaGen
- This is a DENTAL IMPLANT company

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SHIP-TO LOCATION:
   - Shows which office received implant products
   - Look for office name/address

6. LINE ITEMS:
   - Implants, abutments, surgical kits
   - Product codes and descriptions

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Dental implants - use Dental Supplies Inventory

PARSING RULES:
- High-value product invoice
- May include surgical kit items
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Clipboard Health': `You are parsing invoices from Clipboard Health.

VENDOR IDENTIFICATION:
- Primary Name: Clipboard Health
- This is a STAFFING/HEALTHCARE STAFFING service

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE LOCATION:
   - Shows which office used staffing services
   - May include worker details

6. LINE ITEMS:
   - Staffing hours, worker assignments
   - Hourly rates and totals

GL ACCOUNT GUIDANCE:
- May vary by location and staffing type
- Check line items for service type

PARSING RULES:
- Staffing/service invoice format
- May include timesheet details
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Trilogy Medwaste West LLC': `You are parsing invoices from Trilogy Medwaste West LLC.

VENDOR IDENTIFICATION:
- Primary Name: Trilogy Medwaste West LLC
- Also appears as: Trilogy Medwaste
- This is a MEDICAL WASTE DISPOSAL service

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE LOCATION:
   - Shows which office received pickup service
   - Look for office name/address

6. LINE ITEMS:
   - Medical waste pickup/disposal
   - Container rentals

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53220 Office Expenses:53225 Hazardous Disposal
- Location breakdown:
  * General-Columbia: 53225 Hazardous Disposal (3 occurrences)
  * Other locations: 53225 Hazardous Disposal
- Medical waste - use Hazardous Disposal expense

PARSING RULES:
- Service invoice format
- May be monthly pickup schedule
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Trustworkz Inc': `You are parsing invoices from Trustworkz Inc.

VENDOR IDENTIFICATION:
- Primary Name: Trustworkz Inc
- Also appears as: Trustworkz
- This is a MARKETING/WEB SERVICES company

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. BILLING ENTITY:
   - Usually billed to marketing/corporate

6. LINE ITEMS:
   - Web development, marketing services
   - May include project-based billing

GL ACCOUNT GUIDANCE:
- Primary Account: 11000 Fixed Assets:11050 Intangible Assets (for development)
- Class: Div-Marketing (6 occurrences)
- Marketing/web development expense

PARSING RULES:
- Project/service invoice format
- May include development milestones
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Method Procurement Technologies LLC': `You are parsing invoices from Method Procurement Technologies LLC.

VENDOR IDENTIFICATION:
- Primary Name: Method Procurement Technologies LLC
- Also appears as: Method Procurement
- This is a PROCUREMENT/SOFTWARE service

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. BILLING ENTITY:
   - Usually billed to corporate/finance

6. LINE ITEMS:
   - Software/service fees
   - May include subscription pricing

GL ACCOUNT GUIDANCE:
- Typically software/service expense
- Check for IT or Contract Services category

PARSING RULES:
- Software/SaaS invoice format
- Subscription-based billing possible
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Dental & Medical Staffing, Inc': `You are parsing invoices from Dental & Medical Staffing, Inc.

VENDOR IDENTIFICATION:
- Primary Name: Dental & Medical Staffing, Inc
- Also appears as: Dental Medical Staffing
- This is a STAFFING service for dental offices

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE LOCATION:
   - Shows which office used staffing services
   - May include temp worker details

6. LINE ITEMS:
   - Staffing hours and rates
   - Worker assignments

GL ACCOUNT GUIDANCE:
- Primary Account: 50000 Expenses:51000 Direct Labor:51200 Support Labor:51220 Other Direct Labor:51224 Other Direct Labor-Training & Continuing Education
- Location: General-Salem (1 occurrence)
- Staffing/labor expense

PARSING RULES:
- Staffing/service invoice format
- May include timesheet details
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Pacific Dental Services': `You are parsing invoices from Pacific Dental Services.

VENDOR IDENTIFICATION:
- Primary Name: Pacific Dental Services
- Also appears as: PDS
- This is a DENTAL SERVICES/SUPPORT organization

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. SERVICE DETAILS:
   - Shows services provided
   - May include support/management services

6. LINE ITEMS:
   - Service fees, support charges
   - May be detailed or summary

GL ACCOUNT GUIDANCE:
- Check for specific service type
- May vary based on services provided

PARSING RULES:
- Service invoice format
- May include multiple service categories
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'Pacific Crest Smiles': `You are parsing invoices from Pacific Crest Smiles.

VENDOR IDENTIFICATION:
- Primary Name: Pacific Crest Smiles
- NOTE: This is INTERNAL - Pacific Crest Smiles invoicing itself
- May be inter-company transfers or allocations

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for "Invoice #" or "Invoice Number"
   - Location: Header area

2. INVOICE DATE:
   - Label: "Invoice Date" or "Date"

3. DUE DATE:
   - Label: "Due Date" or payment terms

4. TOTAL AMOUNT:
   - Label: "Total" or "Amount Due"

5. FROM/TO OFFICES:
   - Shows which offices are involved
   - Inter-company transfer details

6. LINE ITEMS:
   - Internal charges, allocations
   - May include expense transfers

GL ACCOUNT GUIDANCE:
- Internal transfer - check for specific allocation type
- May involve multiple GL accounts

PARSING RULES:
- Internal/inter-company invoice
- Verify this is a valid invoice and not just a document
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`,

  'darby': `You are parsing invoices from Darby Dental Supply.

NOTE: This is the same vendor as "Darby Dental Supply" - normalize vendor name.

VENDOR IDENTIFICATION:
- Primary Name: Darby Dental Supply, LLC
- Also appears as: Darby Dental, darby (lowercase)
- Normalize to: "Darby Dental Supply"

[Same format as Darby Dental Supply]

GL ACCOUNT GUIDANCE:
- Primary Account: 10200 Inventory:10210 Dental Supplies Inventory
- Dental supplies - use Dental Supplies Inventory

PARSING RULES:
- Normalize vendor name to "Darby Dental Supply"
- Amounts: extract as numbers without currency symbols
- Dates: convert to YYYY-MM-DD format`
};

// Connect to database
const dbPath = process.argv[2] || path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to database:', dbPath);

const db = new Database(dbPath);

// Update prompts for each vendor
let updated = 0;
let created = 0;

for (const [vendorName, prompt] of Object.entries(vendorPrompts)) {
  try {
    // Check if vendor exists
    const existing = db.prepare('SELECT id FROM vendor_knowledge_bases WHERE vendor_name = ?').get(vendorName);
    
    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE vendor_knowledge_bases 
        SET knowledge_prompt = ?, updated_at = datetime('now')
        WHERE vendor_name = ?
      `).run(prompt, vendorName);
      console.log(`✓ Updated: ${vendorName}`);
      updated++;
    } else {
      // Create new
      const id = require('crypto').randomUUID();
      db.prepare(`
        INSERT INTO vendor_knowledge_bases (id, vendor_name, knowledge_prompt, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).run(id, vendorName, prompt);
      console.log(`+ Created: ${vendorName}`);
      created++;
    }
  } catch (err) {
    console.error(`✗ Error for ${vendorName}:`, err.message);
  }
}

console.log(`\nSummary: ${updated} updated, ${created} created`);
db.close();
