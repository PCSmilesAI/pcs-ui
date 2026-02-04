#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'pcs_ui_data', 'pcs.db');
console.log('Connecting to:', dbPath);
const db = new Database(dbPath);

const vendors = {
  'Naomi Swinehart': `You are parsing invoices from Naomi Swinehart.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services - categorize by service type`,

  'Pacific Crest Smiles': `You are parsing invoices from Pacific Crest Smiles.
VENDOR: Internal/related party - FLAG FOR REVIEW
GL ACCOUNT: REVIEW REQUIRED - internal transfer`,

  'Safeway': `You are parsing invoices from Safeway.
VENDOR: Grocery/retail store
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses`,

  'Ultradent Products, Inc.': `You are parsing invoices from Ultradent Products, Inc.
VENDOR: Dental products manufacturer
GL ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory`,

  'Crystal Falls': `You are parsing invoices from Crystal Falls.
VENDOR: Water/beverage service
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses`,

  'Clark Public Utilities': `You are parsing invoices from Clark Public Utilities.
VENDOR: Utility company (electric, water)
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53130 Utilities`,

  'Comcast Business': `You are parsing invoices from Comcast Business.
VENDOR: Internet/phone service provider
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53110 Internet & Phone`,

  'Pacific Office Automation': `You are parsing invoices from Pacific Office Automation.
VENDOR: Office equipment vendor (copiers, printers)
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53400 Equipment:53410 Equipment Lease/Rental`,

  'Henry Schein One': `You are parsing invoices from Henry Schein One.
VENDOR: Dental software company (Dentrix)
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing`,

  'UnitedHealthcare': `You are parsing invoices from UnitedHealthcare.
VENDOR: Health insurance company
GL ACCOUNT: 50000 Expenses:51000 Direct Labor:51200 Employee Benefits:51210 Health Insurance`,

  'CTR Services Northwest, LLC': `You are parsing invoices from CTR Services Northwest, LLC.
VENDOR: Parent company - FLAG FOR REVIEW
GL ACCOUNT: REVIEW REQUIRED - related party transaction`,

  'Darby Dental Supply': `You are parsing invoices from Darby Dental Supply.
VENDOR: Dental supply distributor
GL ACCOUNT: 10200 Inventory:10210 Dental Supplies Inventory`,

  'FASTSIGNS': `You are parsing invoices from FASTSIGNS.
VENDOR: Signage/printing company
GL ACCOUNT: 50000 Expenses:54000 Other Expenses:54200 Advertising & Marketing`,

  'Axis Electric': `You are parsing invoices from Axis Electric.
VENDOR: Electrical contractor
GL ACCOUNT: Contract Services or Repairs & Maintenance`,

  'Bath & Body Works': `You are parsing invoices from Bath & Body Works.
VENDOR: Retail store
GL ACCOUNT: Office Expenses`,

  'Benjamin Bird': `You are parsing invoices from Benjamin Bird.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Benjamin Harrison': `You are parsing invoices from Benjamin Harrison.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Bio-Tek Medical': `You are parsing invoices from Bio-Tek Medical.
VENDOR: Medical gas supplier (N2O, O2)
GL ACCOUNT: 50000 Expenses:52000 Direct Supplies:52100 Sundries:52120 Medical Gases`,

  'Bonadent Dental Lab': `You are parsing invoices from Bonadent Dental Lab.
VENDOR: Dental lab - crowns, bridges
GL ACCOUNT: 50000 Expenses:52000 Direct Supplies:52200 Lab Fees:52210 Dental Lab Fees`,

  'Braxton Ellsworth': `You are parsing invoices from Braxton Ellsworth.
VENDOR: Individual - may be internal/owner
GL ACCOUNT: REVIEW REQUIRED`,

  'Bridgeford LLC': `You are parsing invoices from Bridgeford LLC.
VENDOR: Legal/professional services
GL ACCOUNT: Professional Fees`,

  'Brown and Joseph': `You are parsing invoices from Brown and Joseph.
VENDOR: Collections/accounts receivable service
GL ACCOUNT: Contract Services`,

  'Bruton Comfort Control, Inc': `You are parsing invoices from Bruton Comfort Control, Inc.
VENDOR: HVAC contractor
GL ACCOUNT: Contract Services or Repairs & Maintenance`,

  'Caitlin McBride': `You are parsing invoices from Caitlin McBride.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Canva': `You are parsing invoices from Canva.
VENDOR: Design software
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing`,

  'Carlos Cortes Santos': `You are parsing invoices from Carlos Cortes Santos.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Casey Kariya_': `You are parsing invoices from Casey Kariya.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Casie Nacinovich-1': `You are parsing invoices from Casie Nacinovich.
VENDOR: Individual - may be internal
GL ACCOUNT: REVIEW REQUIRED`,

  'Cassandra Kennedy': `You are parsing invoices from Cassandra Kennedy.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Cathy Gegenhuber': `You are parsing invoices from Cathy Gegenhuber.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Chase Merchant Services Paymentech': `You are parsing invoices from Chase Merchant Services.
VENDOR: Credit card processing
GL ACCOUNT: Bank Fees or Processing Fees`,

  'ChatGPT': `You are parsing invoices from ChatGPT (OpenAI).
VENDOR: AI software subscription
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53200 Office Expenses:53227 Computer Software & Licensing`,

  'Chevron': `You are parsing invoices from Chevron.
VENDOR: Gas station/fuel
GL ACCOUNT: Vehicle Expenses or Travel`,

  'Chick-Fil-A': `You are parsing invoices from Chick-Fil-A.
VENDOR: Restaurant/food
GL ACCOUNT: Meals & Entertainment`,

  'Chipotle': `You are parsing invoices from Chipotle.
VENDOR: Restaurant/food
GL ACCOUNT: Meals & Entertainment`,

  'Christina Sweringen': `You are parsing invoices from Christina Sweringen.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Christine Deardorff': `You are parsing invoices from Christine Deardorff.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'City of Milwaukie': `You are parsing invoices from City of Milwaukie.
VENDOR: Municipal utility/services
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53130 Utilities`,

  'City of Riddle': `You are parsing invoices from City of Riddle.
VENDOR: Municipal utility/services
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53130 Utilities`,

  'City of Roseburg Water Division': `You are parsing invoices from City of Roseburg Water Division.
VENDOR: Municipal water utility
GL ACCOUNT: 50000 Expenses:53000 Center Level Expenses:53100 Communications:53130 Utilities`,

  'Claims Recovery': `You are parsing invoices from Claims Recovery.
VENDOR: Collections/recovery service
GL ACCOUNT: Contract Services`,

  'Clark County': `You are parsing invoices from Clark County.
VENDOR: Government/county services
GL ACCOUNT: Varies by service type`,

  'Clearent': `You are parsing invoices from Clearent.
VENDOR: Credit card processing
GL ACCOUNT: Bank Fees or Processing Fees`,

  'Collin Harris': `You are parsing invoices from Collin Harris.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Comfort Flow Heating': `You are parsing invoices from Comfort Flow Heating.
VENDOR: HVAC contractor
GL ACCOUNT: Contract Services or Repairs & Maintenance`,

  'Continuum Legal Group LLP': `You are parsing invoices from Continuum Legal Group LLP.
VENDOR: Law firm
GL ACCOUNT: Professional Fees / Legal Expenses`,

  'Cooper Garretson': `You are parsing invoices from Cooper Garretson.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Courier Northwest': `You are parsing invoices from Courier Northwest.
VENDOR: Courier/delivery service
GL ACCOUNT: Postage & Shipping`,

  'Cow Creek': `You are parsing invoices from Cow Creek.
VENDOR: Tribal entity - may be various services
GL ACCOUNT: Varies by service`,

  'Credit Card Misc': `You are parsing invoices from Credit Card Misc.
VENDOR: Miscellaneous credit card charges
GL ACCOUNT: REVIEW REQUIRED - categorize by actual charge`,

  'Crozier Kimball': `You are parsing invoices from Crozier Kimball.
VENDOR: Individual - may be accountant/professional
GL ACCOUNT: Professional Fees`,

  'Dain Grosman': `You are parsing invoices from Dain Grosman.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Dane Anguiano-': `You are parsing invoices from Dane Anguiano.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Darko Marusnik': `You are parsing invoices from Darko Marusnik.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'David Agnello': `You are parsing invoices from David Agnello.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'David Arnett': `You are parsing invoices from David Arnett.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'David Diaz': `You are parsing invoices from David Diaz.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Deborah Allert': `You are parsing invoices from Deborah Allert.
VENDOR: Individual contractor
GL ACCOUNT: Contract Services or Direct Labor`,

  'Delta Airlines': `You are parsing invoices from Delta Airlines.
VENDOR: Airline
GL ACCOUNT: Travel Expenses`,

  'Delta Dental Attn Accounting Dept': `You are parsing invoices from Delta Dental.
VENDOR: Dental insurance company
GL ACCOUNT: 50000 Expenses:51000 Direct Labor:51200 Employee Benefits`
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
