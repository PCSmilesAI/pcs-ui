#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Delta Dental Of Oregon': `VENDOR: Dental insurance company. GL ACCOUNT: Employee Benefits`,
  'Delta Dental Oregon': `VENDOR: Dental insurance company (same as Delta Dental Of Oregon). GL ACCOUNT: Employee Benefits`,
  'Dentis USA Corp': `VENDOR: Dental implant company. GL ACCOUNT: Dental Supplies Inventory`,
  'Dentsply': `VENDOR: Dental products manufacturer. GL ACCOUNT: Dental Supplies Inventory`,
  'Dexis': `VENDOR: Dental imaging equipment/software. GL ACCOUNT: Equipment or Software Licensing`,
  'Douglas County': `VENDOR: County government services. GL ACCOUNT: Varies by service`,
  'Dr. Catherine Murphy': `VENDOR: Individual - may be consultant. GL ACCOUNT: Professional Fees`,
  'Emily Harlow': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Envista Business Services LLC': `VENDOR: Dental business services. GL ACCOUNT: Contract Services`,
  'Epic Dental': `VENDOR: Dental products company. GL ACCOUNT: Dental Supplies Inventory`,
  'Felicia Scott': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Frontier Communications': `VENDOR: Telecom provider. GL ACCOUNT: Internet & Phone`,
  "Gall's Inc": `VENDOR: Uniform/safety equipment. GL ACCOUNT: Uniforms & Cleaning`,
  'George Kalogerinis': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Gloria Castellon': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Green Mountain Energy': `VENDOR: Energy provider. GL ACCOUNT: Utilities`,
  'Guardian Life Insurance': `VENDOR: Insurance company. GL ACCOUNT: Employee Benefits`,
  'Guttmann and Blaevoet': `VENDOR: Engineering/consulting firm. GL ACCOUNT: Professional Fees`,
  "HEATH'S LAUNDRY": `VENDOR: Laundry service (same as Heath's Laundry). GL ACCOUNT: Uniforms & Cleaning`,
  'Hannah Ritzert': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Heartland Payment Systems': `VENDOR: Credit card processing. GL ACCOUNT: Bank Fees`,
  'Heather Gilmore': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Hilton Hotels': `VENDOR: Hotel. GL ACCOUNT: Travel Expenses`,
  'Hu-Friedy': `VENDOR: Dental instruments manufacturer. GL ACCOUNT: Dental Supplies Inventory`,
  'Hunter Fans': `VENDOR: Fan/ventilation equipment. GL ACCOUNT: Equipment or Office Expenses`,
  'Hurst Family Dental': `VENDOR: Dental practice - may be referral. GL ACCOUNT: REVIEW REQUIRED`,
  'ImageFirst': `VENDOR: Linen/uniform service. GL ACCOUNT: Uniforms & Cleaning`,
  'Intuit QuickBooks Payments': `VENDOR: Payment processing. GL ACCOUNT: Bank Fees`,
  'Ivoclar Vivadent Inc': `VENDOR: Dental products manufacturer. GL ACCOUNT: Dental Supplies Inventory`,
  'Jennifer Perrera': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Jimmy Johns': `VENDOR: Restaurant/food. GL ACCOUNT: Meals & Entertainment`,
  'John Sisco': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Jose Luna': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Joshua West': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Julie Groves': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kasey Minniti': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kathryn Garretson': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kavo Kerr': `VENDOR: Dental equipment manufacturer. GL ACCOUNT: Equipment or Dental Supplies`,
  'Kaylee Pomeroy': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kelly Klemm': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kerr Dental': `VENDOR: Dental products manufacturer. GL ACCOUNT: Dental Supplies Inventory`,
  'Kim Garretson': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kimberly Snyder': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Kyle Thompson': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Lakeway Publishers Inc': `VENDOR: Publishing/printing. GL ACCOUNT: Advertising & Marketing`,
  'Laura Griffin': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Lighthouse Electric & Alarm': `VENDOR: Electrical/security contractor. GL ACCOUNT: Contract Services`,
  'Lori Criswell': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'MSD Dental Lab': `VENDOR: Dental laboratory. GL ACCOUNT: Dental Lab Fees`,
  'Maria Chavez Ramos': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Mariana Chavez': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Mark Oster': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Marriott Hotels': `VENDOR: Hotel. GL ACCOUNT: Travel Expenses`,
  'Mary Daggett': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Megan Nunes': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Michael Ruiz': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Michelle Tebo': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Modern Smiles': `VENDOR: Dental practice - may be referral. GL ACCOUNT: REVIEW REQUIRED`,
  'Mohsen Modern Dentistry': `VENDOR: Dental practice - may be referral. GL ACCOUNT: REVIEW REQUIRED`,
  'Nationwide Insurance': `VENDOR: Insurance company. GL ACCOUNT: Insurance Expense`,
  'NexHealth': `VENDOR: Dental software/scheduling. GL ACCOUNT: Computer Software & Licensing`,
  'Northwest Natural Gas': `VENDOR: Utility company. GL ACCOUNT: Utilities`,
  'Obsidian Financial Services': `VENDOR: Financial services. GL ACCOUNT: Professional Fees`,
  'Olga Chavez': `VENDOR: Individual contractor. GL ACCOUNT: Contract Services or Direct Labor`,
  'Orascoptic': `VENDOR: Dental loupes/lighting. GL ACCOUNT: Equipment or Dental Supplies`,
  'Oregon DEQ': `VENDOR: State environmental agency. GL ACCOUNT: Regulatory Fees`,
  'Oregon Department of Revenue': `VENDOR: State tax authority. GL ACCOUNT: Taxes`,
  'Oregon Secretary of State': `VENDOR: State filing/registration. GL ACCOUNT: Regulatory Fees`,
  'Orthodent': `VENDOR: Orthodontic products. GL ACCOUNT: Dental Supplies Inventory`,
  'PAN Construction Inc': `VENDOR: Construction contractor. GL ACCOUNT: Repairs & Maintenance or Contract Services`,
  'PNC Bank': `VENDOR: Banking services. GL ACCOUNT: Bank Fees`,
  'Pacific Dental Services': `VENDOR: Dental support organization. GL ACCOUNT: Contract Services`,
  'Pacific Power': `VENDOR: Utility company. GL ACCOUNT: Utilities`,
  'Paychex': `VENDOR: Payroll services. GL ACCOUNT: Payroll Services`,
  'Pearl': `VENDOR: Dental AI/analytics. GL ACCOUNT: Computer Software & Licensing`,
  'Penelope Ellsworth': `VENDOR: Individual - may be internal. GL ACCOUNT: REVIEW REQUIRED`,
  'Pentron Corporation': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Portland General Electric': `VENDOR: Utility company. GL ACCOUNT: Utilities`,
  'Premier Dental Products Company': `VENDOR: Dental products. GL ACCOUNT: Dental Supplies Inventory`,
  'Principal Financial Group': `VENDOR: Insurance/financial services. GL ACCOUNT: Employee Benefits`
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
