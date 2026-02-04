#!/usr/bin/env node
/**
 * Re-parse Failed Invoices Script
 * 
 * This script finds invoices with $0.00 amounts or failed parsing status,
 * re-runs the vendor_router.py on their PDF files, and updates the database
 * with the newly extracted data.
 * 
 * Run with: node scripts/reparse-failed-invoices.js
 * Dry run (no changes): node scripts/reparse-failed-invoices.js --dry-run
 * Limit invoices: node scripts/reparse-failed-invoices.js --limit 50
 */

const Database = require('better-sqlite3');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');
const EMAIL_INVOICES_DIR = process.env.EMAIL_INVOICES_DIR || path.join(__dirname, '..', 'pcs_ui_data', 'email_invoices');
const OUTPUT_JSONS_DIR = process.env.OUTPUT_JSONS_DIR || path.join(__dirname, '..', 'pcs_ui_data', 'output_jsons');
const VENDOR_ROUTER_PATH = process.env.VENDOR_ROUTER_PATH || path.join(__dirname, '..', 'vendor_router.py');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const limitIdx = process.argv.indexOf('--limit');
  return limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : 0;
})();

console.log('='.repeat(60));
console.log('Re-parse Failed Invoices Script');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Email Invoices Dir: ${EMAIL_INVOICES_DIR}`);
console.log(`Output JSONs Dir: ${OUTPUT_JSONS_DIR}`);
console.log(`Vendor Router: ${VENDOR_ROUTER_PATH}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
if (LIMIT) console.log(`Limit: ${LIMIT} invoices`);
console.log('='.repeat(60));

// Check if paths exist
if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: Database not found at ${DB_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(VENDOR_ROUTER_PATH)) {
  console.error(`ERROR: Vendor router not found at ${VENDOR_ROUTER_PATH}`);
  process.exit(1);
}

// Open database
const db = new Database(DB_PATH);

// Get all invoices with zero amounts or failed parsing
console.log('\nFinding invoices that need re-parsing...');
let query = `
  SELECT id, invoice_number, source_file, pdf_path, vendor_name, amount_cents, 
         parsing_status, parse_attempts
  FROM invoices 
  WHERE deleted = 0 
    AND (
      (amount_cents IS NULL OR amount_cents = 0)
      OR parsing_status = 'failed'
      OR parsing_status = 'partial'
    )
    AND pdf_path IS NOT NULL 
    AND pdf_path != ''
  ORDER BY created_at DESC
`;

if (LIMIT > 0) {
  query += ` LIMIT ${LIMIT}`;
}

const failedInvoices = db.prepare(query).all();
console.log(`Found ${failedInvoices.length} invoices to re-parse`);

// Helper: Extract PDF filename from path
function getPdfFilename(pdfPath) {
  if (!pdfPath) return null;
  
  // Handle /api/pdf/filename.pdf format
  if (pdfPath.startsWith('/api/pdf/')) {
    return pdfPath.substring('/api/pdf/'.length);
  }
  
  // Handle full path
  return path.basename(pdfPath);
}

// Helper: Find PDF file on disk
function findPdfFile(pdfFilename) {
  if (!pdfFilename) return null;
  
  const directPath = path.join(EMAIL_INVOICES_DIR, pdfFilename);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  
  // Try without hash suffix
  const baseName = pdfFilename.replace(/\.pdf$/i, '').replace(/_[a-f0-9]{8}$/i, '');
  const files = fs.readdirSync(EMAIL_INVOICES_DIR);
  for (const file of files) {
    if (file.toLowerCase().endsWith('.pdf')) {
      const fileBase = file.replace(/\.pdf$/i, '').replace(/_[a-f0-9]{8}$/i, '');
      if (fileBase.toLowerCase() === baseName.toLowerCase()) {
        return path.join(EMAIL_INVOICES_DIR, file);
      }
    }
  }
  
  return null;
}

// Helper: Run vendor_router.py on a PDF
function runParser(pdfPath) {
  try {
    const result = execSync(
      `python3 ${VENDOR_ROUTER_PATH} "${pdfPath}"`,
      { 
        cwd: path.dirname(VENDOR_ROUTER_PATH),
        timeout: 120000, // 2 minute timeout
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    return { success: true, vendor: result.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Helper: Find and parse the output JSON
function findOutputJson(pdfPath) {
  const pdfFilename = path.basename(pdfPath);
  const baseName = pdfFilename.replace(/\.pdf$/i, '');
  
  // Try exact match first
  const exactPath = path.join(OUTPUT_JSONS_DIR, baseName + '.json');
  if (fs.existsSync(exactPath)) {
    try {
      return JSON.parse(fs.readFileSync(exactPath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  
  // Try finding by prefix (in case of hash differences)
  const files = fs.readdirSync(OUTPUT_JSONS_DIR);
  const baseWithoutHash = baseName.replace(/_[a-f0-9]{8}$/i, '');
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const fileBase = file.replace(/\.json$/i, '').replace(/_[a-f0-9]{8}$/i, '');
      if (fileBase.toLowerCase() === baseWithoutHash.toLowerCase()) {
        const jsonPath = path.join(OUTPUT_JSONS_DIR, file);
        try {
          return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch (e) {
          continue;
        }
      }
    }
  }
  
  return null;
}

// Process invoices
let successCount = 0;
let failedCount = 0;
let skippedCount = 0;
const results = [];

console.log('\n--- PROCESSING INVOICES ---');

for (let i = 0; i < failedInvoices.length; i++) {
  const invoice = failedInvoices[i];
  const pdfFilename = getPdfFilename(invoice.pdf_path);
  const pdfPath = findPdfFile(pdfFilename);
  
  if (!pdfPath) {
    console.log(`  [${i+1}/${failedInvoices.length}] SKIP ${invoice.invoice_number}: PDF not found (${pdfFilename})`);
    skippedCount++;
    results.push({ id: invoice.id, invoice_number: invoice.invoice_number, status: 'skipped', reason: 'PDF not found' });
    continue;
  }
  
  console.log(`  [${i+1}/${failedInvoices.length}] PARSE ${invoice.invoice_number}: ${path.basename(pdfPath)}`);
  
  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would parse: ${pdfPath}`);
    continue;
  }
  
  // Run the parser
  const parseResult = runParser(pdfPath);
  
  if (!parseResult.success) {
    console.log(`    ❌ Parser failed: ${parseResult.error.substring(0, 100)}`);
    failedCount++;
    results.push({ id: invoice.id, invoice_number: invoice.invoice_number, status: 'failed', reason: 'Parser error' });
    
    // Update database to increment parse_attempts
    db.prepare(`
      UPDATE invoices 
      SET parse_attempts = COALESCE(parse_attempts, 0) + 1,
          parsing_status = 'failed',
          parsing_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(parseResult.error.substring(0, 500), invoice.id);
    
    continue;
  }
  
  // Find the output JSON
  const jsonData = findOutputJson(pdfPath);
  
  if (!jsonData) {
    console.log(`    ⚠️ No JSON output found`);
    failedCount++;
    results.push({ id: invoice.id, invoice_number: invoice.invoice_number, status: 'failed', reason: 'No JSON output' });
    continue;
  }
  
  // Extract data from JSON
  const newInvoiceNumber = jsonData.invoice_number || '';
  const vendor = jsonData.vendor_name || jsonData.vendor || invoice.vendor_name;
  const total = jsonData.total || jsonData.invoice_total || '';
  const officeLocation = jsonData.office_location || '';
  const invoiceDate = jsonData.invoice_date || '';
  const dueDate = jsonData.due_date || '';
  
  // Parse amount
  let amountCents = 0;
  if (total) {
    const totalStr = String(total).replace(/[^0-9.]/g, '');
    const totalNum = parseFloat(totalStr);
    if (!isNaN(totalNum)) {
      amountCents = Math.round(totalNum * 100);
    }
  }
  
  // Determine parsing status
  const hasAmount = amountCents > 0;
  const hasInvoiceNumber = newInvoiceNumber && !newInvoiceNumber.startsWith('UNKNOWN-') && newInvoiceNumber.trim() !== '';
  const hasVendor = vendor && vendor !== 'Unknown' && vendor.trim() !== '';
  
  let parsingStatus = 'success';
  let parsingError = null;
  
  if (!hasAmount && !hasInvoiceNumber && !hasVendor) {
    parsingStatus = 'failed';
    parsingError = 'No data extracted from invoice';
  } else if (!hasAmount) {
    parsingStatus = 'partial';
    parsingError = 'Invoice total not extracted';
  }
  
  // Update database - don't update invoice_number to avoid UNIQUE constraint issues
  db.prepare(`
    UPDATE invoices 
    SET 
      vendor_name = CASE WHEN ? != '' AND ? != 'Unknown' THEN ? ELSE vendor_name END,
      parsed_vendor_name = CASE WHEN ? != '' AND ? != 'Unknown' THEN ? ELSE parsed_vendor_name END,
      amount_cents = CASE WHEN ? > 0 THEN ? ELSE amount_cents END,
      parsed_amount_cents = CASE WHEN ? > 0 THEN ? ELSE parsed_amount_cents END,
      office_location = CASE WHEN ? != '' THEN ? ELSE office_location END,
      office_id = CASE WHEN ? != '' THEN ? ELSE office_id END,
      invoice_date = CASE WHEN ? != '' THEN ? ELSE invoice_date END,
      due_date = CASE WHEN ? != '' THEN ? ELSE due_date END,
      total = CASE WHEN ? > 0 THEN CAST(? AS REAL) / 100.0 ELSE total END,
      invoice_total = CASE WHEN ? > 0 THEN CAST(? AS REAL) / 100.0 ELSE invoice_total END,
      parsing_status = ?,
      parsing_error = ?,
      parse_attempts = COALESCE(parse_attempts, 0) + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    vendor, vendor, vendor,
    vendor, vendor, vendor,
    amountCents, amountCents,
    amountCents, amountCents,
    officeLocation, officeLocation,
    officeLocation, officeLocation,
    invoiceDate, invoiceDate,
    dueDate, dueDate,
    amountCents, amountCents,
    amountCents, amountCents,
    parsingStatus,
    parsingError,
    invoice.id
  );
  
  if (amountCents > 0) {
    const dollars = (amountCents / 100).toFixed(2);
    console.log(`    ✅ SUCCESS: $${dollars}, ${vendor}, ${invoice.invoice_number}`);
    successCount++;
    results.push({ 
      id: invoice.id, 
      invoice_number: invoice.invoice_number, 
      status: 'success', 
      amount: dollars,
      vendor 
    });
  } else {
    console.log(`    ⚠️ PARTIAL: No amount extracted (vendor: ${vendor})`);
    failedCount++;
    results.push({ 
      id: invoice.id, 
      invoice_number: invoice.invoice_number, 
      status: 'partial', 
      reason: 'No amount',
      vendor 
    });
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Total processed: ${failedInvoices.length}`);
console.log(`Success (with amount): ${successCount}`);
console.log(`Failed/Partial: ${failedCount}`);
console.log(`Skipped (no PDF): ${skippedCount}`);

if (DRY_RUN) {
  console.log('\n[DRY RUN] No changes were made');
}

db.close();
console.log('\nDone!');

