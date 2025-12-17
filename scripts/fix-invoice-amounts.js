#!/usr/bin/env node
/**
 * Fix Invoice Amounts Script
 * 
 * This script scans invoices with $0.00 amounts and attempts to find the
 * correct amount from their corresponding JSON files or invoice_queue.json.
 * 
 * Run with: node scripts/fix-invoice-amounts.js
 * Dry run (no changes): node scripts/fix-invoice-amounts.js --dry-run
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');
const OUTPUT_JSONS_DIR = process.env.OUTPUT_JSONS_DIR || path.join(__dirname, '..', 'output_jsons');
const PUBLIC_OUTPUT_JSONS_DIR = path.join(__dirname, '..', 'public', 'output_jsons');
// Check multiple queue file locations, prioritize the largest one
const INVOICE_QUEUE_PATHS = [
  path.join(__dirname, '..', 'pcs_ui_data', 'invoice_queue.json'),
  path.join(__dirname, '..', 'pcs_ai_data', 'invoice_queue.json'),
  path.join(__dirname, '..', 'invoice_queue.json'),
  path.join(__dirname, '..', 'public', 'invoice_queue.json'),
];
const DRY_RUN = process.argv.includes('--dry-run');

console.log('='.repeat(60));
console.log('Invoice Amount Fixer Script');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Output JSONs Dir: ${OUTPUT_JSONS_DIR}`);
console.log(`Public Output JSONs Dir: ${PUBLIC_OUTPUT_JSONS_DIR}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
console.log('='.repeat(60));

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: Database not found at ${DB_PATH}`);
  process.exit(1);
}

// Load invoice_queue.json files for reference
let allQueueInvoices = [];
for (const queuePath of INVOICE_QUEUE_PATHS) {
  if (fs.existsSync(queuePath)) {
    try {
      const rawData = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      // Handle both formats: { invoices: [...] } or just [...]
      const invoices = Array.isArray(rawData) ? rawData : (rawData.invoices || []);
      console.log(`Loaded ${invoices.length} invoices from ${queuePath}`);
      allQueueInvoices = allQueueInvoices.concat(invoices);
    } catch (err) {
      console.warn(`Warning: Could not load ${queuePath}: ${err.message}`);
    }
  }
}

// Create a lookup map from invoice_queue by invoice_number and id
const queueLookup = new Map();
for (const inv of allQueueInvoices) {
  const total = inv.total || inv.invoice_total || inv.amount;
  if (total) {
    // Add by invoice_number
    if (inv.invoice_number) {
      queueLookup.set(inv.invoice_number, { ...inv, _total: total });
    }
    // Also add by id
    if (inv.id && inv.id !== inv.invoice_number) {
      queueLookup.set(inv.id, { ...inv, _total: total });
    }
    // Add by invoice field
    if (inv.invoice && inv.invoice !== inv.invoice_number) {
      queueLookup.set(inv.invoice, { ...inv, _total: total });
    }
  }
}
console.log(`Built queue lookup map with ${queueLookup.size} unique entries`);

/**
 * Parse amount from various formats
 */
function parseAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  if (typeof value === 'number') {
    return Math.round(value * 100); // Convert dollars to cents
  }
  
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  
  if (isNaN(num) || num <= 0) {
    return null;
  }
  
  return Math.round(num * 100); // Convert dollars to cents
}

/**
 * Try to find and parse JSON file for an invoice
 */
function findJsonAndExtractAmount(sourceFile, invoiceNumber) {
  // Possible paths to check
  const possiblePaths = [];
  
  if (sourceFile) {
    // Try source_file as-is
    const basename = path.basename(sourceFile);
    possiblePaths.push(path.join(OUTPUT_JSONS_DIR, basename));
    possiblePaths.push(path.join(PUBLIC_OUTPUT_JSONS_DIR, basename));
    
    // If it ends with .json, also try that directly
    if (basename.endsWith('.json')) {
      possiblePaths.push(path.join(OUTPUT_JSONS_DIR, basename));
    }
    
    // If source_file is a PDF, try corresponding JSON
    if (basename.endsWith('.pdf')) {
      const jsonName = basename.replace(/\.pdf$/i, '.json');
      possiblePaths.push(path.join(OUTPUT_JSONS_DIR, jsonName));
      possiblePaths.push(path.join(PUBLIC_OUTPUT_JSONS_DIR, jsonName));
    }
  }
  
  // Try invoice_number based paths
  if (invoiceNumber) {
    possiblePaths.push(path.join(OUTPUT_JSONS_DIR, `${invoiceNumber}.json`));
    possiblePaths.push(path.join(PUBLIC_OUTPUT_JSONS_DIR, `${invoiceNumber}.json`));
  }
  
  // Try each path
  for (const jsonPath of possiblePaths) {
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        
        // Try various fields for the total
        const total = jsonContent.total || jsonContent.invoice_total || jsonContent.amount;
        const amountCents = parseAmount(total);
        
        if (amountCents && amountCents > 0) {
          return { amountCents, source: jsonPath };
        }
        
        // Try summing line items if no total found
        if (jsonContent.line_items && Array.isArray(jsonContent.line_items)) {
          let lineTotal = 0;
          for (const item of jsonContent.line_items) {
            const lineAmount = parseAmount(item.line_item_total || item.total || item.amount);
            if (lineAmount) {
              lineTotal += lineAmount;
            }
          }
          if (lineTotal > 0) {
            return { amountCents: lineTotal, source: `${jsonPath} (sum of line items)` };
          }
        }
      } catch (err) {
        // Ignore parse errors, try next path
      }
    }
  }
  
  return null;
}

// Open database
const db = new Database(DB_PATH);

// Get all invoices with zero or null amounts
console.log('\nLoading invoices with $0.00 amounts...');
const zeroAmountInvoices = db.prepare(`
  SELECT id, invoice_number, source_file, amount_cents, parsed_amount_cents, vendor_name
  FROM invoices 
  WHERE deleted = 0 
    AND (amount_cents IS NULL OR amount_cents = 0)
  ORDER BY created_at DESC
`).all();

console.log(`Found ${zeroAmountInvoices.length} invoices with $0.00 amounts`);

// Process each invoice
let fixedFromJson = 0;
let fixedFromQueue = 0;
let notFound = 0;
const fixes = [];
const notFoundList = [];

for (const invoice of zeroAmountInvoices) {
  let result = null;
  
  // First try JSON files
  result = findJsonAndExtractAmount(invoice.source_file, invoice.invoice_number);
  
  if (result) {
    fixes.push({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      vendor: invoice.vendor_name,
      amountCents: result.amountCents,
      source: result.source,
      sourceType: 'json'
    });
    fixedFromJson++;
    continue;
  }
  
  // Try invoice_queue.json lookup (by invoice_number first, then by id)
  let queueInvoice = queueLookup.get(invoice.invoice_number);
  if (!queueInvoice) {
    queueInvoice = queueLookup.get(invoice.id);
  }
  
  if (queueInvoice && queueInvoice._total) {
    const amountCents = parseAmount(queueInvoice._total);
    if (amountCents && amountCents > 0) {
      fixes.push({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        vendor: invoice.vendor_name,
        amountCents: amountCents,
        source: 'invoice_queue.json',
        sourceType: 'queue'
      });
      fixedFromQueue++;
      continue;
    }
  }
  
  // Could not find amount
  notFoundList.push({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    vendor: invoice.vendor_name,
    sourceFile: invoice.source_file
  });
  notFound++;
}

// Report results
console.log('\n' + '='.repeat(60));
console.log('RESULTS');
console.log('='.repeat(60));
console.log(`Can fix from JSON files: ${fixedFromJson}`);
console.log(`Can fix from invoice_queue.json: ${fixedFromQueue}`);
console.log(`Total fixable: ${fixes.length}`);
console.log(`Could not find amount: ${notFound}`);

if (fixes.length > 0) {
  console.log('\n--- SAMPLE FIXES (first 15) ---');
  for (const fix of fixes.slice(0, 15)) {
    const dollars = (fix.amountCents / 100).toFixed(2);
    console.log(`  ${fix.invoiceNumber}: $${dollars} (from ${fix.sourceType})`);
  }
  if (fixes.length > 15) {
    console.log(`  ... and ${fixes.length - 15} more`);
  }
}

if (notFoundList.length > 0) {
  console.log('\n--- COULD NOT FIX (first 10) ---');
  for (const nf of notFoundList.slice(0, 10)) {
    console.log(`  ${nf.invoiceNumber}: ${nf.vendor || 'Unknown Vendor'}`);
  }
  if (notFoundList.length > 10) {
    console.log(`  ... and ${notFoundList.length - 10} more`);
  }
}

// Apply fixes if not dry run
if (!DRY_RUN && fixes.length > 0) {
  console.log('\n--- APPLYING FIXES ---');
  
  const updateStmt = db.prepare(`
    UPDATE invoices 
    SET 
      amount_cents = ?,
      parsed_amount_cents = COALESCE(parsed_amount_cents, ?),
      total = CAST(? AS REAL) / 100.0,
      invoice_total = CAST(? AS REAL) / 100.0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  const transaction = db.transaction(() => {
    for (const fix of fixes) {
      updateStmt.run(fix.amountCents, fix.amountCents, fix.amountCents, fix.amountCents, fix.id);
    }
  });
  
  transaction();
  console.log(`Updated ${fixes.length} invoice(s)`);
} else if (DRY_RUN && fixes.length > 0) {
  console.log('\n[DRY RUN] Would update', fixes.length, 'invoice(s)');
  console.log('Run without --dry-run to apply changes');
}

db.close();
console.log('\nDone!');

