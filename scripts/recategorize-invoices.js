#!/usr/bin/env node
/**
 * Recategorize Invoices Script
 * 
 * Fixes invoices that have incorrect categories like:
 * - "20000 Accounts Payable (A/P)" (wrong account type)
 * - "Uncategorized"
 * - "50000 expenses" (too generic)
 * 
 * Run with: node scripts/recategorize-invoices.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const XLSX = require('xlsx');

// Database path
const dbPath = path.join(process.cwd(), 'pcs_ui_data', 'pcs.db');
const excelPath = path.join(process.cwd(), 'pcs_qbo_transactions.xlsx');

// Hardcoded vendor accounts (same as vendorCategoryMap.ts)
const HARDCODED_VENDOR_ACCOUNTS = {
  'american express': '10010 Checking - CTR Services Northwest',
  'stampli': '53334 Software',
  'bio-tek medical': '52120 Medical Gases',
  'avista': '53323 Natural Gas',
  "builder's electric, inc": '11040 Leasehold Improvements',
  'south umpaqua disposal': '53225 Hazardous Disposal',
  'culligan': '53220 Office Expenses',
  'dexis': '53334 Software',
  'cintas': '53361 Contract Services',
  'crest+oral-b': '10210 Dental Supplies Inventory',
  'ultradent products inc': '10210 Dental Supplies Inventory',
  'ultradent': '10210 Dental Supplies Inventory',
  'linde gas & equipment inc': '52120 Medical Gases',
  'linde gas': '52120 Medical Gases',
  'heaths laundry': '53224 Uniforms & Cleaning',
  'method procurement technologies llc': '53334 Software',
  'method procurement': '53334 Software',
  'fyle inc': '53334 Software',
  'fyle': '53334 Software',
  'megagen america': '11010 Dental Equipment',
  'megagen': '11010 Dental Equipment',
  'comcast business': '53331 Internet',
  'comcast': '53331 Internet',
  'trustworkz inc': '53334 Software',
  'trustworkz': '53334 Software',
  'trilogy medwaste west llc': '53225 Hazardous Disposal',
  'trilogy medwaste': '53225 Hazardous Disposal',
  'brassler usa': '10210 Dental Supplies Inventory',
  'brassler': '10210 Dental Supplies Inventory',
  'airgas usa llc': '52120 Medical Gases',
  'airgas': '52120 Medical Gases',
  'adt': '53361 Contract Services',
  'adt security': '53361 Contract Services',
  'patterson dental': '10210 Dental Supplies Inventory',
  'patterson': '10210 Dental Supplies Inventory',
  'henry schein': '10210 Dental Supplies Inventory',
  'henry schein inc': '10210 Dental Supplies Inventory',
  
  // Additional vendors
  'ondiem': '53361 Contract Services',
  'benco': '10210 Dental Supplies Inventory',
  'benco dental': '10210 Dental Supplies Inventory',
  'national interpreting service inc': '53361 Contract Services',
  'national interpreting service': '53361 Contract Services',
  'safeway': '53220 Office Expenses',
  'statdds': '53334 Software',
  'oral biotech': '10210 Dental Supplies Inventory',
  'oral biotech, llc': '10210 Dental Supplies Inventory',
  'procter & gamble': '10210 Dental Supplies Inventory',
  'umpqua valley fire services': '53361 Contract Services',
  'umpqua valley fire services, inc': '53361 Contract Services',
  'marion environmental services': '53225 Hazardous Disposal',
  'marion environmental services, inc.': '53225 Hazardous Disposal',
  'bonadent': '52210 Dental Lab Fees',
  'pacific dental services': '53361 Contract Services',
  'corsearch': '53334 Software',
  'berman fink van horn p.c.': '53360 Professional Fees',
  'berman fink van horn': '53360 Professional Fees',
  'tc dental': '10210 Dental Supplies Inventory',
  'tc dental laboratory': '52210 Dental Lab Fees',
  'glidewell': '52210 Dental Lab Fees',
  'glidewell dental': '52210 Dental Lab Fees',
};

// Categories that need fixing
const BAD_CATEGORIES = [
  '20000 Accounts Payable (A/P)',
  'Uncategorized',
  '50000 expenses',
];

function loadExcelMappings() {
  const mappings = new Map();
  
  try {
    const fileBuffer = require('fs').readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    
    for (const row of rows) {
      const vendor = (row.Vendor || '').toString().trim().toLowerCase();
      if (!vendor) continue;
      
      const expenseAccount = (row['Account full name_1'] || '').toString().trim();
      const apAccount = (row['Account full name'] || '').toString().trim();
      
      let accountFullName = '';
      if (expenseAccount && !expenseAccount.toLowerCase().includes('accounts payable')) {
        accountFullName = expenseAccount;
      } else if (apAccount && !apAccount.toLowerCase().includes('accounts payable')) {
        accountFullName = apAccount;
      }
      
      if (!accountFullName) continue;
      
      // Track count per vendor-account pair
      const key = `${vendor}|${accountFullName}`;
      mappings.set(key, (mappings.get(key) || 0) + 1);
    }
    
    // Convert to vendor -> best account mapping
    const vendorAccounts = new Map();
    for (const [key, count] of mappings) {
      const [vendor, account] = key.split('|');
      const existing = vendorAccounts.get(vendor);
      if (!existing || count > existing.count) {
        vendorAccounts.set(vendor, { account, count });
      }
    }
    
    return vendorAccounts;
  } catch (err) {
    console.error('Failed to load Excel:', err.message);
    return new Map();
  }
}

function extractMostSpecificCategory(hierarchicalPath) {
  if (!hierarchicalPath) return hierarchicalPath;
  const parts = hierarchicalPath.split(':');
  return parts[parts.length - 1].trim();
}

function findBestCategory(vendorName, excelMappings) {
  const normalized = (vendorName || '').trim().toLowerCase();
  
  // Check hardcoded first
  if (HARDCODED_VENDOR_ACCOUNTS[normalized]) {
    return extractMostSpecificCategory(HARDCODED_VENDOR_ACCOUNTS[normalized]);
  }
  
  // Check fuzzy match on hardcoded
  for (const [key, value] of Object.entries(HARDCODED_VENDOR_ACCOUNTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return extractMostSpecificCategory(value);
    }
  }
  
  // Check Excel mappings
  if (excelMappings.has(normalized)) {
    return extractMostSpecificCategory(excelMappings.get(normalized).account);
  }
  
  // Fuzzy match on Excel
  for (const [vendor, data] of excelMappings) {
    if (normalized.includes(vendor) || vendor.includes(normalized)) {
      return extractMostSpecificCategory(data.account);
    }
  }
  
  return null;
}

async function main() {
  console.log('=== Invoice Recategorization Script ===\n');
  
  const db = new Database(dbPath);
  const excelMappings = loadExcelMappings();
  console.log(`Loaded ${excelMappings.size} vendor mappings from Excel\n`);
  
  // Find all invoice_categories with bad categories
  const badCategories = db.prepare(`
    SELECT ic.id, ic.invoice_id, ic.category_name, i.vendor_name
    FROM invoice_categories ic
    JOIN invoices i ON ic.invoice_id = i.id
    WHERE ic.category_name IN (${BAD_CATEGORIES.map(() => '?').join(',')})
  `).all(...BAD_CATEGORIES);
  
  console.log(`Found ${badCategories.length} invoice categories needing recategorization\n`);
  
  // Group by current category for reporting
  const byCategory = {};
  for (const row of badCategories) {
    byCategory[row.category_name] = (byCategory[row.category_name] || 0) + 1;
  }
  console.log('Breakdown by current category:');
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log('');
  
  // Recategorize
  const updateStmt = db.prepare(`
    UPDATE invoice_categories 
    SET category_name = ?, source = 'vendor_mapping'
    WHERE id = ?
  `);
  
  let updated = 0;
  let skipped = 0;
  const stillUncategorized = [];
  
  for (const row of badCategories) {
    const newCategory = findBestCategory(row.vendor_name, excelMappings);
    
    if (newCategory) {
      updateStmt.run(newCategory, row.id);
      updated++;
    } else {
      skipped++;
      stillUncategorized.push(row.vendor_name);
    }
  }
  
  console.log(`\nResults:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no mapping found): ${skipped}`);
  
  if (stillUncategorized.length > 0) {
    const uniqueVendors = [...new Set(stillUncategorized)];
    console.log(`\nVendors still uncategorized (${uniqueVendors.length}):`);
    uniqueVendors.slice(0, 20).forEach(v => console.log(`  - ${v}`));
    if (uniqueVendors.length > 20) {
      console.log(`  ... and ${uniqueVendors.length - 20} more`);
    }
  }
  
  // Verify results
  const remaining = db.prepare(`
    SELECT category_name, COUNT(*) as count 
    FROM invoice_categories 
    WHERE category_name IN (${BAD_CATEGORIES.map(() => '?').join(',')})
    GROUP BY category_name
  `).all(...BAD_CATEGORIES);
  
  console.log(`\nRemaining bad categories after recategorization:`);
  if (remaining.length === 0) {
    console.log('  None - all fixed!');
  } else {
    for (const row of remaining) {
      console.log(`  ${row.category_name}: ${row.count}`);
    }
  }
  
  db.close();
  console.log('\n=== Done ===');
}

main().catch(console.error);
