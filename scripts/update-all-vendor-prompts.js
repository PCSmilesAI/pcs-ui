#!/usr/bin/env node
/**
 * Script to update ALL vendor knowledge base prompts with detailed, unique instructions
 * for each vendor based on GL account data and vendor categorization
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Load GL account mappings
const glMappingsPath = path.join(__dirname, '..', 'config', 'qbo_vendor_categories.json');
let glMappings = [];
try {
  glMappings = JSON.parse(fs.readFileSync(glMappingsPath, 'utf-8'));
  console.log(`Loaded ${glMappings.length} GL mapping entries`);
} catch (e) {
  console.error('Warning: Could not load GL mappings:', e.message);
}

// Helper function to get GL account info for a vendor
function getVendorGLAccounts(vendorName) {
  const normalized = vendorName.toLowerCase().trim();
  const matches = glMappings.filter(m => {
    const vendorLower = (m.vendor || '').toLowerCase();
    return vendorLower === normalized || 
           vendorLower.includes(normalized) || 
           normalized.includes(vendorLower);
  });
  
  // Group by account and class
  const accounts = {};
  matches.forEach(m => {
    if (m.accountFullName && 
        !m.accountFullName.includes('Accounts Payable') && 
        !m.accountFullName.includes('Cash and Cash Equivalents')) {
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

// Categorize vendor by their GL accounts
function categorizeVendor(vendorName, glAccounts) {
  const accountStr = glAccounts.map(a => a.account).join(' ').toLowerCase();
  
  if (accountStr.includes('dental lab fees') || accountStr.includes('lab fees')) {
    return 'dental_lab';
  }
  if (accountStr.includes('dental supplies inventory') || accountStr.includes('inventory')) {
    return 'dental_supplies';
  }
  if (accountStr.includes('medical gases')) {
    return 'medical_gas';
  }
  if (accountStr.includes('uniforms & cleaning') || accountStr.includes('laundry')) {
    return 'laundry_cleaning';
  }
  if (accountStr.includes('software') || accountStr.includes('it expenses')) {
    return 'software_it';
  }
  if (accountStr.includes('contract services') || accountStr.includes('professional fees')) {
    return 'contract_services';
  }
  if (accountStr.includes('utilities') || accountStr.includes('electricity') || accountStr.includes('water') || accountStr.includes('natural gas')) {
    return 'utilities';
  }
  if (accountStr.includes('rent') || accountStr.includes('ticam') || accountStr.includes('lease')) {
    return 'rent_lease';
  }
  if (accountStr.includes('hazardous disposal') || accountStr.includes('waste')) {
    return 'waste_disposal';
  }
  if (accountStr.includes('marketing') || accountStr.includes('advertising')) {
    return 'marketing';
  }
  if (accountStr.includes('office expenses') || accountStr.includes('office supplies')) {
    return 'office_expenses';
  }
  if (accountStr.includes('refunds')) {
    return 'patient_refund';
  }
  if (accountStr.includes('training') || accountStr.includes('continuing education')) {
    return 'training';
  }
  if (accountStr.includes('insurance')) {
    return 'insurance';
  }
  if (accountStr.includes('travel') || accountStr.includes('meals') || accountStr.includes('lodging')) {
    return 'travel_expenses';
  }
  if (accountStr.includes('bank') || accountStr.includes('collection fees')) {
    return 'bank_fees';
  }
  
  return 'general';
}

// Generate prompt based on vendor category
function generatePrompt(vendorName, category, glAccounts) {
  const primaryAccount = glAccounts.length > 0 ? glAccounts[0].account : 'Uncategorized';
  const locationBreakdown = glAccounts.length > 0 && glAccounts[0].classes.length > 0 
    ? glAccounts[0].classes.slice(0, 3).map(c => `  * ${c.class}: ${glAccounts[0].account.split(':').pop()} (${c.count} occurrences)`).join('\n')
    : '  * Various locations';

  const categoryDescriptions = {
    dental_lab: {
      type: 'DENTAL LAB',
      description: 'This vendor provides dental laboratory services (crowns, dentures, prosthetics)',
      fieldNotes: `
6. PATIENT NAME:
   - Dental lab invoices typically include patient name
   - Important for matching lab work to patient records
   - May appear as "Patient:", "Patient Name:", or in case header

7. CASE DETAILS:
   - May include: Tooth numbers, Shade, Doctor name
   - Look for dental procedure codes (D-codes)`,
      parseNotes: `- This is LAB WORK - categorize to Dental Lab Fees, NOT Supplies Inventory
- Patient name is important for case matching
- May include rush charges or discounts`
    },
    dental_supplies: {
      type: 'DENTAL SUPPLIES DISTRIBUTOR',
      description: 'This vendor provides dental supplies and equipment',
      fieldNotes: `
6. LINE ITEMS:
   - Product table with SKU/item codes
   - Quantities, unit prices, extended amounts
   - May include product descriptions`,
      parseNotes: `- Dental supplies - categorize to Dental Supplies Inventory
- May include equipment purchases
- Check for freight/shipping charges to include in total`
    },
    medical_gas: {
      type: 'MEDICAL GAS SUPPLIER',
      description: 'This vendor provides medical gases (N2O, O2)',
      fieldNotes: `
6. LINE ITEMS:
   - Gas products (Nitrous Oxide, Oxygen)
   - Cylinder rentals and returns
   - Delivery charges`,
      parseNotes: `- Medical gas supplier - categorize to Medical Gases expense
- May include cylinder rental/deposit charges
- Delivery information may indicate office location`
    },
    laundry_cleaning: {
      type: 'LAUNDRY/CLEANING SERVICE',
      description: 'This vendor provides laundry, linen, or cleaning services',
      fieldNotes: `
6. LINE ITEMS:
   - Laundry/cleaning services
   - Uniform cleaning, linen service
   - May include pickup/delivery details`,
      parseNotes: `- Service provider - categorize to Uniforms & Cleaning expense
- Often recurring/weekly billing
- Look for service location in header`
    },
    software_it: {
      type: 'SOFTWARE/IT SERVICE',
      description: 'This vendor provides software or IT services',
      fieldNotes: `
6. LINE ITEMS:
   - Software subscription fees
   - IT service charges
   - May include per-user or license pricing`,
      parseNotes: `- Software/IT expense - categorize to IT Expenses or Software
- Often subscription-based recurring billing
- May be billed to corporate/finance`
    },
    contract_services: {
      type: 'CONTRACT SERVICE PROVIDER',
      description: 'This vendor provides contracted professional services',
      fieldNotes: `
6. LINE ITEMS:
   - Service descriptions
   - Labor hours or flat fees
   - May include project details`,
      parseNotes: `- Contract service - categorize to Contract Services or Professional Fees
- Check service type for specific categorization
- May be recurring or project-based`
    },
    utilities: {
      type: 'UTILITY PROVIDER',
      description: 'This vendor provides utility services (electric, gas, water)',
      fieldNotes: `
6. LINE ITEMS:
   - Usage charges (kWh, therms, gallons)
   - Base/service charges
   - Taxes and fees`,
      parseNotes: `- Utility expense - categorize to appropriate utility type (Electricity, Natural Gas, Water)
- Service address indicates office location
- Often monthly recurring billing`
    },
    rent_lease: {
      type: 'LANDLORD/PROPERTY MANAGEMENT',
      description: 'This vendor is a landlord or property management company',
      fieldNotes: `
6. LINE ITEMS:
   - Rent charges
   - CAM/TICAM charges
   - Lease-related fees`,
      parseNotes: `- Rent expense - categorize to Rent or TICAM as appropriate
- Property address indicates office location
- Monthly recurring billing`
    },
    waste_disposal: {
      type: 'WASTE DISPOSAL SERVICE',
      description: 'This vendor provides waste disposal or medical waste services',
      fieldNotes: `
6. LINE ITEMS:
   - Pickup/disposal services
   - Container rentals
   - Regulatory compliance fees`,
      parseNotes: `- Waste disposal - categorize to Hazardous Disposal or Waste Disposal
- Service location indicates office
- May be scheduled pickup service`
    },
    marketing: {
      type: 'MARKETING/ADVERTISING SERVICE',
      description: 'This vendor provides marketing or advertising services',
      fieldNotes: `
6. LINE ITEMS:
   - Marketing services
   - Advertising placements
   - Creative/design work`,
      parseNotes: `- Marketing expense - categorize to appropriate marketing account
- May be project-based or retainer
- Check for campaign/project references`
    },
    office_expenses: {
      type: 'OFFICE SUPPLIES/SERVICES',
      description: 'This vendor provides office supplies or general services',
      fieldNotes: `
6. LINE ITEMS:
   - Office supplies and products
   - General service charges`,
      parseNotes: `- Office expense - categorize to Office Expenses
- Check service/product type for specific categorization`
    },
    patient_refund: {
      type: 'PATIENT REFUND',
      description: 'This is a patient refund payment',
      fieldNotes: `
6. DETAILS:
   - Patient name
   - Refund amount
   - Reason for refund if provided`,
      parseNotes: `- Patient refund - categorize to Refunds account
- Include patient name for tracking
- Note: This may be a payment, not an invoice`
    },
    training: {
      type: 'TRAINING/EDUCATION SERVICE',
      description: 'This vendor provides training or continuing education',
      fieldNotes: `
6. LINE ITEMS:
   - Training/course fees
   - Materials or registration
   - CE credit information`,
      parseNotes: `- Training expense - categorize to Training & Continuing Education
- May include employee information`
    },
    insurance: {
      type: 'INSURANCE PROVIDER',
      description: 'This vendor is an insurance company or provider',
      fieldNotes: `
6. LINE ITEMS:
   - Premium charges
   - Policy information
   - Coverage periods`,
      parseNotes: `- Insurance expense - categorize to appropriate insurance account
- Often monthly or periodic billing
- Policy number may be important`
    },
    travel_expenses: {
      type: 'TRAVEL/EXPENSE REIMBURSEMENT',
      description: 'This is travel or expense reimbursement',
      fieldNotes: `
6. DETAILS:
   - Travel details (transportation, lodging)
   - Meal expenses
   - Business purpose`,
      parseNotes: `- Travel expense - categorize to Travel, Meals, or Lodging as appropriate
- Check for employee/person name
- May require receipts for documentation`
    },
    bank_fees: {
      type: 'BANK/FINANCIAL SERVICE',
      description: 'This vendor provides banking or financial services',
      fieldNotes: `
6. LINE ITEMS:
   - Service fees
   - Transaction charges
   - Account maintenance`,
      parseNotes: `- Bank fee - categorize to Bank & Collection Fees
- Often monthly recurring charges`
    },
    general: {
      type: 'VENDOR',
      description: 'General vendor',
      fieldNotes: `
6. LINE ITEMS:
   - Product or service details
   - Quantities and amounts`,
      parseNotes: `- Review line items to determine appropriate GL category
- Check vendor type and services provided`
    }
  };

  const catInfo = categoryDescriptions[category] || categoryDescriptions.general;

  return `You are parsing invoices from ${vendorName}.

VENDOR IDENTIFICATION:
- Primary Name: ${vendorName}
- Type: ${catInfo.type}
- ${catInfo.description}

INVOICE LAYOUT - FIELD LOCATIONS:

1. INVOICE NUMBER:
   - Look for: "Invoice #", "Invoice Number", "Inv #", "Invoice No.", "Document #"
   - Location: Typically top right of invoice header
   - May be numeric or alphanumeric

2. INVOICE DATE:
   - Look for: "Invoice Date", "Date", "Inv Date"
   - Location: Header section, near invoice number
   - Format: May be MM/DD/YYYY, M/D/YY, or YYYY-MM-DD

3. DUE DATE:
   - Look for: "Due Date", "Payment Due", "Due"
   - May also show "Payment Terms" (e.g., "Net 30")
   - If not explicit, calculate from invoice date + terms

4. TOTAL AMOUNT:
   - Look for: "Total", "Amount Due", "Invoice Total", "Balance Due", "Total Due"
   - Location: Bottom right of invoice, after line items
   - Format: Dollar amount with or without $ symbol

5. SHIP-TO / SERVICE LOCATION:
   - Look for: "Ship To", "Service Location", "Deliver To", "Location"
   - Shows which Pacific Crest Smiles / Smiles Dental office
   - Common locations: Milwaukie, Lebanon, Eugene, Roseburg, Riddle, Salem, Ridgefield, Columbia
${catInfo.fieldNotes}

GL ACCOUNT GUIDANCE:
- Primary Account: ${primaryAccount}
- Location breakdown:
${locationBreakdown}
- Use the location/ship-to address to determine the appropriate class (General-Milwaukie, General-Lebanon, etc.)

PARSING RULES:
${catInfo.parseNotes}
- Amounts: Extract as numbers without currency symbols
- Dates: Convert to YYYY-MM-DD format
- If document is a "Statement" rather than "Invoice", classify as Other Document (statement)
- If document is a "Credit Memo", classify as Other Document (credit_memo)

OUTPUT FORMAT:
Return a JSON object with: invoice_number, invoice_date, due_date, vendor_name, total, office_location, line_items`;
}

// Connect to database
const dbPath = process.argv[2] || path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to database:', dbPath);

const db = new Database(dbPath);

// Get all vendors that still have the generic template
const vendorsToUpdate = db.prepare(`
  SELECT vendor_name, knowledge_prompt 
  FROM vendor_knowledge_bases 
  WHERE knowledge_prompt LIKE '%EXTRACTION REQUIREMENTS:%'
  AND knowledge_prompt LIKE '%look for "Invoice #"%'
  ORDER BY vendor_name
`).all();

console.log(`Found ${vendorsToUpdate.length} vendors with generic template\n`);

let updated = 0;
let errors = 0;

for (const vendor of vendorsToUpdate) {
  try {
    const glAccounts = getVendorGLAccounts(vendor.vendor_name);
    const category = categorizeVendor(vendor.vendor_name, glAccounts);
    const newPrompt = generatePrompt(vendor.vendor_name, category, glAccounts);
    
    db.prepare(`
      UPDATE vendor_knowledge_bases 
      SET knowledge_prompt = ?, updated_at = datetime('now')
      WHERE vendor_name = ?
    `).run(newPrompt, vendor.vendor_name);
    
    console.log(`✓ ${vendor.vendor_name} -> ${category}`);
    updated++;
  } catch (err) {
    console.error(`✗ ${vendor.vendor_name}: ${err.message}`);
    errors++;
  }
}

console.log(`\nSummary: ${updated} updated, ${errors} errors`);
db.close();
