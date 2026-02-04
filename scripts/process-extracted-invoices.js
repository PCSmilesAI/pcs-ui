#!/usr/bin/env node
/**
 * Process all extracted invoices from email_invoices directory
 * Parses PDFs with vendor router and adds to database
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const BASE_DIR = path.dirname(path.dirname(__filename));
const EMAIL_INVOICES_DIR = path.join(BASE_DIR, 'email_invoices');
const DB_PATH = path.join(BASE_DIR, 'pcs_ui_data', 'pcs.db');
const VENDOR_ROUTER = path.join(BASE_DIR, 'vendor_router.py');

let processedCount = 0;
let skippedCount = 0;
let failedCount = 0;
const startTime = Date.now();

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
}

function getVendor(pdfPath) {
  try {
    const result = execSync(`python3 ${VENDOR_ROUTER} "${pdfPath}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return result || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

function invoiceExists(db, invoiceNumber, sourceFile) {
  try {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM invoices 
      WHERE (invoice_number = ? OR source_file = ?) AND deleted = 0
    `);
    const result = stmt.get(invoiceNumber, sourceFile);
    return result.count > 0;
  } catch (e) {
    return false;
  }
}

function addInvoiceToDb(db, pdfPath, vendor) {
  try {
    const filename = path.basename(pdfPath);
    const invoiceNumber = filename.replace('.pdf', '').substring(0, 50);
    
    if (invoiceExists(db, invoiceNumber, pdfPath)) {
      log(`⏭️  Skipped (already exists): ${filename}`);
      skippedCount++;
      return false;
    }
    
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
    processedCount++;
    return true;
  } catch (error) {
    log(`❌ Failed to add ${path.basename(pdfPath)}: ${error.message}`);
    failedCount++;
    return false;
  }
}

function main() {
  log('='.repeat(60));
  log('PROCESS EXTRACTED INVOICES');
  log('='.repeat(60));
  
  if (!fs.existsSync(EMAIL_INVOICES_DIR)) {
    log(`❌ Directory not found: ${EMAIL_INVOICES_DIR}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(EMAIL_INVOICES_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'));
  
  log(`📁 Found ${files.length} PDF files to process`);
  
  if (files.length === 0) {
    log('⚠️  No PDFs found');
    return;
  }
  
  const db = new Database(DB_PATH);
  
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const pdfPath = path.join(EMAIL_INVOICES_DIR, filename);
    
    if ((i + 1) % 50 === 0) {
      log(`📊 Progress: ${i + 1}/${files.length}`);
    }
    
    const vendor = getVendor(pdfPath);
    addInvoiceToDb(db, pdfPath, vendor);
  }
  
  db.close();
  
  const durationSec = (Date.now() - startTime) / 1000;
  log('='.repeat(60));
  log('PROCESSING COMPLETE');
  log('='.repeat(60));
  log(`✅ Processed: ${processedCount}`);
  log(`⏭️  Skipped: ${skippedCount}`);
  log(`❌ Failed: ${failedCount}`);
  log(`⏱️  Duration: ${durationSec.toFixed(1)}s`);
  log('='.repeat(60));
}

main();

