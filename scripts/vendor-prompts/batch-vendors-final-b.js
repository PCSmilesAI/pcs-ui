#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'ProSites Inc.': `VENDOR: Dental website/marketing. GL ACCOUNT: Advertising & Marketing`,
  'Quality Systems Dental': `VENDOR: Dental equipment/service. GL ACCOUNT: Equipment or Contract Services`,
  'R&D Dental Laboratory': `VENDOR: Dental laboratory. GL ACCOUNT: Dental Lab Fees`,
  'Riggs Distributing': `VENDOR: Distributor. GL ACCOUNT: Based on products`,
  'River City Environmental Inc': `VENDOR: Environmental/waste service. GL ACCOUNT: Hazardous Disposal or Contract Services`,
  'Robert Yates': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Ronald Cummins': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Roseburg Sanitary Service': `VENDOR: Waste/sanitation service. GL ACCOUNT: Office Expenses`,
  'Roth 401k Oregon Saves': `VENDOR: Retirement plan. GL ACCOUNT: Employee Benefits`,
  'SDS Dental': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'SMT Dental Solutions': `VENDOR: Dental products/services. GL ACCOUNT: Dental Supplies or Contract Services`,
  'Samuel Barron': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Scan Mailboxes': `VENDOR: Mail/document service. GL ACCOUNT: Office Expenses`,
  'Scorpion': `VENDOR: Dental marketing. GL ACCOUNT: Advertising & Marketing`,
  'Septodont': `VENDOR: Dental anesthetics. GL ACCOUNT: Dental Supplies Inventory`,
  'Shine Clean': `VENDOR: Cleaning service. GL ACCOUNT: Uniforms & Cleaning`,
  'Shofu Dental Corp': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Silk Road Medical Staffing': `VENDOR: Staffing agency. GL ACCOUNT: Direct Labor`,
  'Silver Plan Administrators': `VENDOR: Retirement plan admin. GL ACCOUNT: Employee Benefits`,
  'Silverton Dental': `VENDOR: Dental practice - may be referral. GL ACCOUNT: REVIEW REQUIRED`,
  'Smile Direct Club': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Snap On Smile': `VENDOR: Dental product. GL ACCOUNT: Dental Supplies Inventory`,
  'Solutionreach': `VENDOR: Dental communication software. GL ACCOUNT: Computer Software & Licensing`,
  'Solventum': `VENDOR: Dental/medical products (3M spinoff). GL ACCOUNT: Dental Supplies Inventory`,
  'South Coast Lumber': `VENDOR: Building materials. GL ACCOUNT: Repairs & Maintenance`,
  'Spectrum Reach': `VENDOR: Advertising. GL ACCOUNT: Advertising & Marketing`,
  'Starbucks': `VENDOR: Coffee/food. GL ACCOUNT: Meals & Entertainment or Office Expenses`,
  'State Industrial Products': `VENDOR: Industrial supplies. GL ACCOUNT: Office Expenses`,
  'Stauffer Manufacturing Co': `VENDOR: Manufacturing. GL ACCOUNT: Based on products`,
  'Straumann': `VENDOR: Dental implants. GL ACCOUNT: Dental Supplies Inventory`,
  'Summit Financial Group LLC': `VENDOR: Financial services. GL ACCOUNT: Professional Fees`,
  'T-Mobile': `VENDOR: Telecom. GL ACCOUNT: Internet & Phone`,
  'TDA Perks': `VENDOR: Dental association benefits. GL ACCOUNT: Professional Fees`,
  'TDK Dental': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'The Hartford': `VENDOR: Insurance company. GL ACCOUNT: Insurance Expense`,
  'Tokuyama Dental America Inc': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Total Dental Administrators': `VENDOR: Dental benefits admin. GL ACCOUNT: Employee Benefits`,
  'Town and Country': `VENDOR: Service provider. GL ACCOUNT: Based on service type`,
  'Trinity Dental Lab': `VENDOR: Dental laboratory. GL ACCOUNT: Dental Lab Fees`,
  'Trustworkz Inc': `VENDOR: Marketing services. GL ACCOUNT: Advertising & Marketing`,
  'UPS': `VENDOR: Shipping. GL ACCOUNT: Postage & Shipping`,
  'Ultradent Products Inc': `VENDOR: Dental products (same as Inc.). GL ACCOUNT: Dental Supplies Inventory`,
  'Unknown': `VENDOR: Unknown - REVIEW REQUIRED. GL ACCOUNT: REVIEW REQUIRED`,
  'VOCO America, Inc.': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Verizon': `VENDOR: Telecom. GL ACCOUNT: Internet & Phone`,
  'W.W. Grainger': `VENDOR: Industrial supplies. GL ACCOUNT: Office Expenses`,
  'Walmart': `VENDOR: Retail store. GL ACCOUNT: Office Expenses`,
  'Weave': `VENDOR: Dental communication software. GL ACCOUNT: Computer Software & Licensing`,
  'West Coast Dental Laboratory': `VENDOR: Dental laboratory. GL ACCOUNT: Dental Lab Fees`,
  'Western Dental Services': `VENDOR: Dental services. GL ACCOUNT: REVIEW REQUIRED`,
  'Whole Foods': `VENDOR: Grocery store. GL ACCOUNT: Office Expenses or Meals`,
  'Wolfe Plumbing & Mechanical': `VENDOR: Plumbing contractor. GL ACCOUNT: Repairs & Maintenance`,
  'Wonderist Agency': `VENDOR: Dental marketing agency. GL ACCOUNT: Advertising & Marketing`,
  'WorkWave': `VENDOR: Service software. GL ACCOUNT: Computer Software & Licensing`,
  'X-Nav Technologies LLC': `VENDOR: Dental navigation technology. GL ACCOUNT: Equipment`,
  'Xero': `VENDOR: Accounting software. GL ACCOUNT: Computer Software & Licensing`,
  'Yapi': `VENDOR: Dental communication software. GL ACCOUNT: Computer Software & Licensing`,
  'Yellowbook': `VENDOR: Directory advertising. GL ACCOUNT: Advertising & Marketing`,
  'Zest Dental Solutions': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Zimmer Biomet': `VENDOR: Dental implants. GL ACCOUNT: Dental Supplies Inventory`,
  'Zocdoc': `VENDOR: Patient scheduling platform. GL ACCOUNT: Computer Software & Licensing`
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
