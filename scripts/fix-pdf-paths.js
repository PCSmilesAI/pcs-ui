#!/usr/bin/env node
/**
 * PDF Path Fixer Script
 * 
 * This script scans the invoices table and fixes pdf_path values that don't match
 * actual files in the email_invoices directory. It handles:
 * - Files with hash suffixes (e.g., file.pdf -> file_abc12345.pdf)
 * - Case-insensitive extension matching (.PDF -> .pdf)
 * 
 * Run with: node scripts/fix-pdf-paths.js
 * Dry run (no changes): node scripts/fix-pdf-paths.js --dry-run
 * Clear missing paths: node scripts/fix-pdf-paths.js --clear-missing
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Configuration
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');
const EMAIL_INVOICES_DIR = process.env.EMAIL_INVOICES_DIR || path.join(__dirname, '..', 'email_invoices');
const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR_MISSING = process.argv.includes('--clear-missing');

console.log('='.repeat(60));
console.log('PDF Path Fixer Script');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log(`Email Invoices Dir: ${EMAIL_INVOICES_DIR}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
console.log(`Clear Missing: ${CLEAR_MISSING ? 'YES (will set pdf_path to NULL for missing files)' : 'NO'}`);
console.log('='.repeat(60));

// Check if paths exist
if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: Database not found at ${DB_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(EMAIL_INVOICES_DIR)) {
  console.error(`ERROR: Email invoices directory not found at ${EMAIL_INVOICES_DIR}`);
  process.exit(1);
}

// Load all files from email_invoices directory
console.log('\nLoading files from email_invoices directory...');
const allFiles = fs.readdirSync(EMAIL_INVOICES_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
console.log(`Found ${allFiles.length} PDF files`);

// Build lookup maps for fast matching
const exactLookup = new Map(); // filename -> full path
const baseLookup = new Map();  // base filename (without hash) -> full path

function getBaseFilename(filename) {
  // Remove .pdf extension (case insensitive)
  let base = filename.replace(/\.pdf$/i, '');
  // Remove hash suffix if present (e.g., _2a8dacff - 8 hex chars)
  base = base.replace(/_[a-f0-9]{8}$/i, '');
  return base.toLowerCase();
}

for (const file of allFiles) {
  const lowerFile = file.toLowerCase();
  exactLookup.set(lowerFile, file);
  
  const baseName = getBaseFilename(file);
  // If multiple files have same base, prefer the one with hash (more specific)
  if (!baseLookup.has(baseName) || file.includes('_')) {
    baseLookup.set(baseName, file);
  }
}

console.log(`Built lookup maps: ${exactLookup.size} exact, ${baseLookup.size} base names`);

// Open database
const db = new Database(DB_PATH);

// Get all invoices with pdf_path set
console.log('\nLoading invoices from database...');
const invoices = db.prepare(`
  SELECT id, invoice_number, pdf_path 
  FROM invoices 
  WHERE deleted = 0 AND pdf_path IS NOT NULL AND pdf_path != ''
`).all();

console.log(`Found ${invoices.length} invoices with pdf_path set`);

// Process each invoice
let matchCount = 0;
let fixedCount = 0;
let notFoundCount = 0;
const fixes = [];
const notFound = [];

for (const invoice of invoices) {
  const pdfPath = invoice.pdf_path;
  
  // Extract filename from path
  let filename = pdfPath;
  if (pdfPath.startsWith('/api/pdf/')) {
    filename = pdfPath.substring('/api/pdf/'.length);
  } else if (pdfPath.includes('/')) {
    filename = pdfPath.split('/').pop();
  }
  
  const lowerFilename = filename.toLowerCase();
  
  // Try exact match first
  if (exactLookup.has(lowerFilename)) {
    matchCount++;
    continue;
  }
  
  // Try base name match
  const baseName = getBaseFilename(filename);
  if (baseLookup.has(baseName)) {
    const actualFile = baseLookup.get(baseName);
    const newPath = `/api/pdf/${actualFile}`;
    
    fixes.push({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      oldPath: pdfPath,
      newPath: newPath,
      actualFile: actualFile
    });
    fixedCount++;
  } else {
    notFound.push({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      pdfPath: pdfPath,
      filename: filename
    });
    notFoundCount++;
  }
}

// Report results
console.log('\n' + '='.repeat(60));
console.log('RESULTS');
console.log('='.repeat(60));
console.log(`Already matching: ${matchCount}`);
console.log(`Can be fixed: ${fixedCount}`);
console.log(`Not found: ${notFoundCount}`);

if (fixes.length > 0) {
  console.log('\n--- FIXES TO APPLY ---');
  for (const fix of fixes.slice(0, 20)) {
    console.log(`  ${fix.invoiceNumber}: ${fix.oldPath}`);
    console.log(`    -> ${fix.newPath}`);
  }
  if (fixes.length > 20) {
    console.log(`  ... and ${fixes.length - 20} more`);
  }
}

if (notFound.length > 0) {
  console.log('\n--- NOT FOUND (no matching file) ---');
  for (const nf of notFound.slice(0, 10)) {
    console.log(`  ${nf.invoiceNumber}: ${nf.filename}`);
  }
  if (notFound.length > 10) {
    console.log(`  ... and ${notFound.length - 10} more`);
  }
}

// Apply fixes if not dry run
if (!DRY_RUN && fixes.length > 0) {
  console.log('\n--- APPLYING FIXES ---');
  
  const updateStmt = db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?');
  
  const transaction = db.transaction(() => {
    for (const fix of fixes) {
      updateStmt.run(fix.newPath, fix.id);
    }
  });
  
  transaction();
  console.log(`Updated ${fixes.length} invoice(s)`);
} else if (DRY_RUN && fixes.length > 0) {
  console.log('\n[DRY RUN] Would update', fixes.length, 'invoice(s)');
  console.log('Run without --dry-run to apply changes');
}

// Clear missing paths if requested
if (CLEAR_MISSING && notFound.length > 0) {
  console.log('\n--- CLEARING MISSING PDF PATHS ---');
  
  const clearStmt = db.prepare('UPDATE invoices SET pdf_path = NULL WHERE id = ?');
  
  const clearTransaction = db.transaction(() => {
    for (const nf of notFound) {
      clearStmt.run(nf.id);
    }
  });
  
  if (!DRY_RUN) {
    clearTransaction();
    console.log(`Cleared pdf_path for ${notFound.length} invoice(s) with missing files`);
  } else {
    console.log(`[DRY RUN] Would clear pdf_path for ${notFound.length} invoice(s)`);
  }
} else if (!CLEAR_MISSING && notFound.length > 0) {
  console.log('\nNote: Run with --clear-missing to set pdf_path to NULL for invoices with missing files');
}

db.close();
console.log('\nDone!');

