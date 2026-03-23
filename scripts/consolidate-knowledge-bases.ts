/**
 * Knowledge Base Consolidation Script
 * 
 * This script:
 * 1. Removes invalid knowledge bases (Unknown, lowercase duplicates)
 * 2. Consolidates duplicate vendors into canonical names
 * 3. Creates knowledge bases for all QBO vendors that don't have one
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.PCS_DATA_DIR 
  ? path.join(process.env.PCS_DATA_DIR, 'pcs.db')
  : path.join(process.cwd(), 'pcs_ui_data', 'pcs.db');

const db = new Database(DB_PATH);

// Vendor consolidation map: maps variations to canonical name
const VENDOR_CONSOLIDATION: Record<string, string> = {
  // Patterson Dental
  ' Patterson Dental Supply Inc.': 'Patterson Dental Supply, Inc.',
  ' Patterson Dental Supply, Inc.': 'Patterson Dental Supply, Inc.',
  'PATTERSON DENTAL': 'Patterson Dental Supply, Inc.',
  'PATTERSON DENTAL SUPPLY INC': 'Patterson Dental Supply, Inc.',
  'PATTERSON DENTAL SUPPLY, INC.': 'Patterson Dental Supply, Inc.',
  'Patterson Dental': 'Patterson Dental Supply, Inc.',
  'Paterson Dental Supply, Inc.': 'Patterson Dental Supply, Inc.',
  
  // Brasseler
  'BRASSELER USA DENTAL, LLC': 'Brasseler USA',
  'BRASSLER U.S.A. DENTAL, LLC': 'Brasseler USA',
  'BRASSLER USA': 'Brasseler USA',
  'Brasseler': 'Brasseler USA',
  'Brasseler U.S.A. Dental, LLC': 'Brasseler USA',
  'Brasseler USA Dental LLC': 'Brasseler USA',
  'Brasseler USA Dental, LLC': 'Brasseler USA',
  
  // Henry Schein
  'HENRY SCHEIN CORPORATE OFFICE': 'Henry Schein, Inc.',
  'HENRY SCHEIN ONE': 'Henry Schein One',
  'Henry Schein': 'Henry Schein, Inc.',
  'Henry Schein Corporate Office': 'Henry Schein, Inc.',
  'Henry Schein Inc.': 'Henry Schein, Inc.',
  'Henry Schein ONE': 'Henry Schein One',
  
  // Darby Dental
  'DARBY DENTAL SUPPLY LLC': 'Darby Dental Supply',
  'Darby Dental': 'Darby Dental Supply',
  'Darby Dental Supply LLC': 'Darby Dental Supply',
  'Darby Dental Supply, LLC': 'Darby Dental Supply',
  'darby': 'Darby Dental Supply',
  
  // Airgas
  'ADCOA GAS & EQUIPMENT': 'Airgas USA LLC',
  'Airgas': 'Airgas USA LLC',
  'Airgas USA': 'Airgas USA LLC',
  'Airgas USA, LLC': 'Airgas USA LLC',
  
  // Culligan
  'CULLIGAN - PORTLAND-ALBANY': 'Culligan',
  'Culligan - Portland-Albany': 'Culligan',
  'Culligan Water': 'Culligan',
  
  // TC Dental — QBO canonical name is "TC Dental Lab"
  'TC Dental Laboratory': 'TC Dental Lab',
  'TC Dental Laboratory, Inc': 'TC Dental Lab',
  'TC Dental Laboratory, Inc.': 'TC Dental Lab',
  
  // Stericycle
  'Stericycle': 'Stericycle, Inc.',
  
  // Ultradent
  'ULTRADENT PRODUCTS, INC.': 'Ultradent Products, Inc.',
  'ULTRATRADENT PRODUCTS, INC.': 'Ultradent Products, Inc.',
  
  // Vyne Dental
  'VYNE DENTAL': 'Vyne Dental',
  
  // Iron Mountain
  'IRON MOUNTAIN': 'Iron Mountain',
  
  // Clipboard Health
  'Clipboard Health (billing@clipboardhealth.com)': 'Clipboard Health',
  
  // Crest + Oral-B
  'Crest + OralB': 'Crest+Oral-B',
  'Crest + Oral-B': 'Crest+Oral-B',
  
  // AS&P Billing
  'AS & P Billing Services Corp': 'AS & P Billing Services Corp',
  'AS&P Billing Services Corp.': 'AS & P Billing Services Corp',
  
  // Benco
  'Benco': 'Benco Dental',
  'Benco Dental Co': 'Benco Dental',
  
  // Builder's Electric
  "Builder's Electric, Inc.": "Builder's Electric, Inc",
  'Builders Electric, Inc.': "Builder's Electric, Inc",
  
  // Corsearch
  'CORSEARCH': 'Corsearch',
  'Corsearch Inc.': 'Corsearch',
  
  // Dental & Medical Staffing
  'Dental & Medical Staffing, Inc': 'Dental & Medical Staffing, Inc',
  'Dental & Medical Staffing, Inc.': 'Dental & Medical Staffing, Inc',
  
  // Glidewell
  'Glidewell': 'Glidewell Laboratories',
  
  // Heath's Laundry
  "HEATH'S LAUNDRY": "Heath's Laundry",
  
  // Hermann Sarmiento
  'HERMANN SARMIENTO': 'Hermann Sarmiento',
  
  // Kettenbach
  'Kettenbach': 'Kettenbach LP',
  'Kettenbach Dental': 'Kettenbach LP',
  
  // MedPro
  'MedPro Disposal, LLC': 'MedPro Waste Disposal, LLC',
  
  // Otis Electric
  'Otis Electric, LLC': 'Otis Electric, LLC',
  'Otis Electric, LLC (LIC #234754)': 'Otis Electric, LLC',
  
  // Pacific Office Automation
  'PACIFIC OFFICE AUTOMATION': 'Pacific Office Automation',
  
  // Passport to Languages
  'Passport to Languages': 'Passport to Languages Inc.',
  
  // TechEdge
  'TECHEDGE Patterson Technical Service': 'TechEdge Patterson Technical Service',
  
  // Trilogy MedWaste
  'Trilogy MedWaste West LLC': 'Trilogy Medwaste West LLC',
  
  // USPS
  'USPS': 'USPS',
  'USPS - Click-N-Ship': 'USPS',
  'USPS Click-N-Ship': 'USPS',
  
  // CTR Services / Smiles Dental
  'COLUMBIA SMILES DENTAL': 'Smiles Dental',
  'CTR SERVICES NORTHWEST LLC DBA SMILES DENTAL': 'CTR Services Northwest, LLC',
  'PC SMILES': 'Pacific Crest Smiles',
  'Ridgefield Smiles Dental': 'Pacific Crest Smiles',
  'Pacific Crest Smiles - Salem': 'Pacific Crest Smiles',
  'Pacific Crest Smiles Dental': 'Pacific Crest Smiles',
  
  // Signing/Interpreting
  'SRI Signing Resources & Interpreters': 'Signing Resources & Interpreters',
  
  // Lowercase entries
  'deluxe': 'Deluxe',
  'maxxeus': 'Maxxeus',
  'onDiem': 'onDiem',
  
  // CINTAS
  'CINTAS FIRE PROTECTION': 'Cintas',
  
  // CTRL ALT IT
  'CTRL ALT IT': 'Ctrl+Alt+IT',
  
  // FASTSIGNS
  'FASTSIGNS': 'FASTSIGNS',
  
  // INDUSTRIAL SOURCE
  'INDUSTRIAL SOURCE': 'Industrial Source',
  
  // JAN-PRO
  'JAN-PRO': 'Jan-Pro',
  
  // STATDDS
  'STATDDS': 'StatDDS',
  
  // ZIMA
  'ZIMA INTERNATIONAL, INC.': 'Zima International, Inc.',
  
  // The Procter and Gamble
  'The Procter and Gamble Distributing LLC': 'Procter & Gamble',
  'The Procter and Gamble Distributing LLC d/b/a P&G Oral Health': 'Procter & Gamble',
};

// Entries to DELETE (invalid)
const INVALID_ENTRIES = [
  'Unknown',
  'Artisan', // Too generic
  'Artisan Communications', // Different company
  'Artisan Digital Brukgaard (ADB)', // Different company
  'Foode', // Invalid
  'NEXCom', // Invalid/typo
  'HealthFirst', // Generic
  'Perfect Dental Supply, Inc.', // Not a real vendor
  'Performance Dental Supply Inc.', // Not a real vendor
  'Preferred Dental Supply, Inc.', // Not a real vendor
  'Pacific Dental Supply, Inc.', // Confusion with Patterson
];

function generateKnowledgePrompt(vendorName: string, aliases: string[] = []): string {
  const aliasNote = aliases.length > 0 
    ? `\nNOTE: This vendor may appear as: ${aliases.join(', ')}. These are all the same vendor.\n`
    : '';
  
  return `You are parsing invoices from ${vendorName}.
${aliasNote}
EXTRACTION REQUIREMENTS:
Extract the following fields from the invoice:

1. invoice_number: The unique invoice identifier (look for "Invoice #", "Invoice Number", "Inv #", "Document #", etc.)
2. invoice_date: The date the invoice was issued (look for "Invoice Date", "Date", "Issued")
3. due_date: When payment is due (look for "Due Date", "Payment Due", "Terms")
4. vendor_name: Should be "${vendorName}"
5. total: The total amount due (look for "Total", "Amount Due", "Balance Due", "Invoice Total", "Grand Total")
6. office_location: The delivery/ship-to location - look for dental office names like "Smiles Dental", "Pacific Crest", city names (Roseburg, Milwaukie, Ridgefield, Salem, etc.)
7. line_items: Array of individual items with description, quantity, unit_price, and amount

PARSING RULES:
- Amounts should be extracted as numbers without currency symbols
- Dates should be in YYYY-MM-DD format when possible
- If a field cannot be found, return null for that field
- For office_location, prioritize finding the specific dental practice location

OUTPUT FORMAT:
Return a JSON object with these exact field names. Do not include any explanation, just the JSON.`;
}

async function main() {
  console.log('\n=== Knowledge Base Consolidation ===\n');
  
  // Step 1: Delete invalid entries
  console.log('Step 1: Removing invalid entries...');
  for (const invalid of INVALID_ENTRIES) {
    const result = db.prepare('DELETE FROM vendor_knowledge_bases WHERE vendor_name = ?').run(invalid);
    if (result.changes > 0) {
      console.log(`  ✓ Deleted: ${invalid}`);
    }
  }
  
  // Step 2: Consolidate duplicates
  console.log('\nStep 2: Consolidating duplicates...');
  const consolidatedAliases: Record<string, string[]> = {};
  
  for (const [variant, canonical] of Object.entries(VENDOR_CONSOLIDATION)) {
    if (variant === canonical) continue; // Skip if already canonical
    
    // Check if variant exists
    const variantKb = db.prepare('SELECT * FROM vendor_knowledge_bases WHERE vendor_name = ?').get(variant);
    if (!variantKb) continue;
    
    // Track aliases for the canonical entry
    if (!consolidatedAliases[canonical]) {
      consolidatedAliases[canonical] = [];
    }
    consolidatedAliases[canonical].push(variant);
    
    // Delete the variant
    db.prepare('DELETE FROM vendor_knowledge_bases WHERE vendor_name = ?').run(variant);
    console.log(`  ✓ Merged "${variant}" → "${canonical}"`);
  }
  
  // Step 3: Update canonical entries with alias information
  console.log('\nStep 3: Updating canonical entries with aliases...');
  for (const [canonical, aliases] of Object.entries(consolidatedAliases)) {
    const exists = db.prepare('SELECT id FROM vendor_knowledge_bases WHERE vendor_name = ?').get(canonical);
    const prompt = generateKnowledgePrompt(canonical, aliases);
    
    if (exists) {
      db.prepare(`
        UPDATE vendor_knowledge_bases 
        SET knowledge_prompt = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE vendor_name = ?
      `).run(prompt, canonical);
      console.log(`  ✓ Updated: ${canonical} (${aliases.length} aliases)`);
    } else {
      const id = require('crypto').randomUUID();
      db.prepare(`
        INSERT INTO vendor_knowledge_bases (id, vendor_name, knowledge_prompt, training_invoice_count)
        VALUES (?, ?, ?, 0)
      `).run(id, canonical, prompt);
      console.log(`  ✓ Created: ${canonical} (${aliases.length} aliases)`);
    }
  }
  
  // Step 4: Fetch QBO vendors and create knowledge bases for those missing
  console.log('\nStep 4: Creating knowledge bases for QBO vendors...');
  
  // Get existing knowledge base vendor names
  const existingKbs = db.prepare('SELECT vendor_name FROM vendor_knowledge_bases').all() as { vendor_name: string }[];
  const existingNames = new Set(existingKbs.map(kb => kb.vendor_name.toLowerCase()));
  
  // QBO vendors list (from the API - 409 vendors)
  const qboVendors = [
    "A-J's Painting & More LLC", "A1 Professional Exterminating", "Abby Losee", "ABC Fire Extinguisher, Inc",
    "Adobe", "ADT Security Services", "Aetna", "Affordable Tile and Roofing", "Airgas USA LLC",
    "All Hands Interpreting Services", "Alora Mason", "Althea Seloover", "Amazon",
    "American Backflow & Plumbing Services, Inc", "American Express", "American Logo Gear LLC",
    "Amigos Capital", "Andrea Trotter", "Angela Garretson_", "APEX Dental Analytics", "Apple",
    "Artisan Dental", "Artisan Dental Laboratory", "AS & P Billing Services Corp", "ASL Interpreters",
    "Assure Hire Inc", "Atrio Health Plans", "Avista", "Axis Electric", "Bath & Body Works",
    "Benco Dental", "Benjamin Bird", "Benjamin Harrison", "Berman Fink Van Horn P.C.", "Bio-Tek Medical",
    "Bonadent Dental Lab", "Brasseler USA", "Braxton Ellsworth", "Bridgeford LLC", "Brightview Electric",
    "Brown and Joseph", "Bruton Comfort Control, Inc", "Builder's Electric, Inc", "Caitlin McBride",
    "Campbell Commercial Real Estate", "Canva", "Carlos Cortes Santos", "Casey Kariya_",
    "Casie Nacinovich-1", "Cassandra Kennedy", "Cathy Gegenhuber", "Chase Merchant Services Paymentech",
    "ChatGPT", "Chevron", "Chick-Fil-A", "Chipotle", "Christina Sweringen", "Christine Deardorff",
    "Cintas", "City of Milwaukie", "City of Riddle", "City of Roseburg Water Division", "Claims Recovery",
    "Clark County", "Clark Public Utilities", "Clearent", "Clipboard Health", "Collin Harris",
    "Comcast Business", "Comfort Flow Heating", "Continuum Legal Group LLP", "Cooper Garretson",
    "Corsearch", "Courier Northwest", "Cow Creek", "Credit Card Misc", "Crest+Oral-B", "Crozier Kimball",
    "Crystal Falls", "Ctrl+Alt+IT", "Culligan", "Dain Grosman", "Dandy", "Dane Anguiano-",
    "Darby Dental Supply", "Darko Marusnik", "David Agnello", "David Arnett", "David Diaz",
    "Deborah Allert", "Delta Airlines", "Delta Dental Attn Accounting Dept", "Delta Dental Of Oregon",
    "Delta Dental Oregon", "Deluxe", "Dental & Medical Staffing, Inc", "Dental Intelligence",
    "Dentis USA Corp", "Dentsply", "Dexis", "Douglas County", "Dr. Catherine Murphy", "Emily Harlow",
    "Envista Business Services LLC", "Epic Dental", "Exodus Dental Solutions", "FASTSIGNS", "Felicia Scott",
    "Frontier Communications", "Fyle, Inc.", "Gall's Inc", "George Kalogerinis", "Gig Forces Inc.",
    "Glidewell Laboratories", "Gloria Castellon", "Green Mountain Energy", "Guardian Life Insurance",
    "Guttmann and Blaevoet", "Hannah Ritzert", "Heartland Payment Systems", "Heath's Laundry",
    "Heather Gilmore", "Henry Schein One", "Henry Schein, Inc.", "Hermann Sarmiento", "Hilton Hotels",
    "Hu-Friedy", "Hunter Fans", "Hurst Family Dental", "ImageFirst", "Industrial Source",
    "Intuit QuickBooks Payments", "Iron Mountain", "Ivoclar Vivadent Inc", "Jan-Pro", "Jennifer Perrera",
    "Jimmy Johns", "John Sisco", "Jose Luna", "Joshua West", "Julie Groves", "Kasey Minniti",
    "Kathryn Garretson", "Kavo Kerr", "Kaylee Pomeroy", "Kelly Klemm", "Kerr Dental", "Kettenbach LP",
    "Kim Garretson", "Kimberly Snyder", "Kyle Thompson", "Lakeway Publishers Inc", "Laura Griffin",
    "Lighthouse Electric & Alarm", "Linde Gas & Equipment Inc.", "Lori Criswell", "Maria Chavez Ramos",
    "Mariana Chavez", "Marion Environmental Services", "Mark Oster", "Marriott Hotels", "Mary Daggett",
    "Maxxeus", "MedPro Waste Disposal, LLC", "MegaGen America", "Megan Nunes", "Method Procurement Technologies LLC",
    "Michael Ruiz", "Michelle Tebo", "Miracle Cleaners", "Modern Smiles", "Mohsen Modern Dentistry",
    "MSD Dental Lab", "Murphy's Law Janitorial", "National Interpreting Service, Inc.", "Nationwide Insurance",
    "NexHealth", "Northwest Natural Gas", "NRC Service", "Obsidian Financial Services", "Olga Chavez",
    "OnDiem", "Orascoptic", "Oregon DEQ", "Oregon Department of Revenue", "Oregon Linen",
    "Oregon Secretary of State", "Orthodent", "Otis Electric, LLC", "Pacific Crest Smiles",
    "Pacific Office Automation", "Pacific Power", "PAN Construction Inc", "Passport to Languages Inc.",
    "Patterson Dental Supply, Inc.", "Pavloff Landscape", "Paychex", "Pearl", "Penelope Ellsworth",
    "Pentron Corporation", "Physician's Resource", "PNC Bank", "Portland General Electric",
    "Preat Corporation", "Premier Dental Products Company", "Principal Financial Group", "ProSites Inc.",
    "Procter & Gamble", "Pure Clean LLC", "Quality Systems Dental", "R&D Dental Laboratory",
    "Rectangle Health", "Republic Services", "Riggs Distributing", "River City Environmental Inc",
    "Robert Yates", "Ronald Cummins", "Roseburg Sanitary Service", "Roth 401k Oregon Saves",
    "Samuel Barron", "Scan Mailboxes", "Scorpion", "SDS Dental", "Septodont", "Shine Clean",
    "Shofu Dental Corp", "Signing Resources & Interpreters", "Silk Road Medical Staffing",
    "Silver Plan Administrators", "Silverton Dental", "Smile Direct Club", "Smiles Dental",
    "SMT Dental Solutions", "Snap On Smile", "Solutionreach", "Solventum", "South Coast Lumber",
    "Spectrum Reach", "Starbucks", "StatDDS", "State Industrial Products", "Stauffer Manufacturing Co",
    "Stericycle, Inc.", "Straumann", "Summit Financial Group LLC", "Sunset Heating, Cooling, & Electrical",
    "T-Mobile", "TC Dental Lab", "TDA Perks", "TDK Dental", "TechEdge Patterson Technical Service",
    "The Hartford", "Tokuyama Dental America Inc", "Total Dental Administrators", "Town and Country",
    "Trilogy Medwaste West LLC", "Trinity Dental Lab", "TrustWorkz, Inc.", "Ultradent Products, Inc.",
    "Umpqua Valley Fire Services,Inc. dba A-1 Fire Protection", "UnitedHealthcare", "UPS", "USPS",
    "Verizon", "VOCO America, Inc.", "Vyne Dental", "W.W. Grainger", "Walmart", "Weave",
    "West Coast Dental Laboratory", "Western Dental Services", "Whole Foods", "Wolfe Plumbing & Mechanical",
    "Wonderist Agency", "WorkWave", "X-Nav Technologies LLC", "Xero", "Yapi", "Yellowbook",
    "Zest Dental Solutions", "Zima International, Inc.", "Zimmer Biomet", "Zocdoc"
  ];
  
  let created = 0;
  for (const vendor of qboVendors) {
    if (existingNames.has(vendor.toLowerCase())) continue;
    
    const id = require('crypto').randomUUID();
    const prompt = generateKnowledgePrompt(vendor);
    
    try {
      db.prepare(`
        INSERT INTO vendor_knowledge_bases (id, vendor_name, knowledge_prompt, training_invoice_count)
        VALUES (?, ?, ?, 0)
      `).run(id, vendor, prompt);
      created++;
    } catch (err) {
      // Likely duplicate, skip
    }
  }
  console.log(`  ✓ Created ${created} new knowledge bases for QBO vendors`);
  
  // Final count
  const finalCount = db.prepare('SELECT COUNT(*) as count FROM vendor_knowledge_bases').get() as { count: number };
  console.log(`\n=== Complete ===`);
  console.log(`Total knowledge bases: ${finalCount.count}`);
  
  db.close();
}

main().catch(console.error);
