#!/usr/bin/env node
/**
 * Bulk import invoices from email_invoices directory directly to database
 * This processes all PDFs in the email_invoices folder and adds them to the database
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = process.env.PCS_DATA_DIR || path.join(__dirname, '..', 'pcs_ui_data');
const DB_PATH = path.join(DATA_DIR, 'pcs.db');
const EMAIL_INVOICES_DIR = path.join(__dirname, '..', 'email_invoices');
const VENDOR_ROUTER = path.join(__dirname, '..', 'vendor_router.py');

let db;
let importedCount = 0;
let skippedCount = 0;
let failedCount = 0;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
}

function invoiceExists(invoiceNumber, sourceFile) {
  const stmt = db.prepare(`
    SELECT id FROM invoices 
    WHERE (invoice_number = ? OR source_file = ?)
    AND deleted = 0
    LIMIT 1
  `);
  return stmt.get(invoiceNumber, sourceFile) !== undefined;
}

function parsePdfWithVendorRouter(pdfPath) {
  try {
    const output = execSync(`python3 "${VENDOR_ROUTER}" "${pdfPath}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    return output || null;
  } catch (error) {
    return null;
  }
}

function addInvoiceToDb(pdfPath, vendor) {
  try {
    const filename = path.basename(pdfPath);
    
    // Extract invoice number from filename (best effort)
    let invoiceNumber = filename.replace('.pdf', '').substring(0, 50);
    
    // Check if already exists
    if (invoiceExists(invoiceNumber, pdfPath)) {
      log(`⏭️  Skipped (already exists): ${filename}`);
      skippedCount++;
      return false;
    }
    
    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO invoices (
        invoice_number,
        source_file,
        parsed_vendor_name,
        vendor_name,
        status,
        created_at,
        updated_at,
        deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    stmt.run(
      invoiceNumber,
      pdfPath,
      vendor || 'unknown',
      vendor || 'unknown',
      'incoming',
      now,
      now,
      0
    );
    
    log(`✅ Added: ${filename} (${vendor})`);
    importedCount++;
    return true;
  } catch (error) {
    log(`❌ Failed to add ${path.basename(pdfPath)}: ${error.message}`);
    failedCount++;
    return false;
  }
}

function main() {
  log('='.repeat(60));
  log('BULK INVOICE IMPORT - Processing email_invoices directory');
  log('='.repeat(60));
  
  try {
    // Check if directory exists
    if (!fs.existsSync(EMAIL_INVOICES_DIR)) {
      log(`❌ Directory not found: ${EMAIL_INVOICES_DIR}`);
      process.exit(1);
    }
    
    // Initialize database
    initDb();
    log(`✅ Connected to database: ${DB_PATH}`);
    
    // Get all PDFs
    const files = fs.readdirSync(EMAIL_INVOICES_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .sort();
    
    log(`Found ${files.length} PDF files to process`);
    
    // Process each PDF
    files.forEach((file, idx) => {
      if ((idx + 1) % 50 === 0) {
        log(`Progress: ${idx + 1}/${files.length}`);
      }
      
      const pdfPath = path.join(EMAIL_INVOICES_DIR, file);
      
      // Parse with vendor router
      const vendor = parsePdfWithVendorRouter(pdfPath);
      
      // Add to database
      addInvoiceToDb(pdfPath, vendor);
    });
    
    db.close();
    
    log('='.repeat(60));
    log('IMPORT COMPLETE');
    log(`✅ Imported: ${importedCount}`);
    log(`⏭️  Skipped: ${skippedCount}`);
    log(`❌ Failed: ${failedCount}`);
    log('='.repeat(60));
    
  } catch (error) {
    log(`❌ Fatal error: ${error.message}`);
    if (db) db.close();
    process.exit(1);
  }
}

main();

