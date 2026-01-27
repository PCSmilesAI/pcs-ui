#!/usr/bin/env ts-node
/**
 * Reparse Dandy Invoices Script
 * 
 * Usage:
 *   npx ts-node scripts/reparse-dandy-invoices.ts [options]
 * 
 * Options:
 *   --failed       Only reparse failed/unknown invoices
 *   --all          Reparse all Dandy invoices (updates existing)
 *   --file <path>  Reparse a specific PDF file
 *   --dry-run      Show what would be reparsed without actually doing it
 *   --limit <n>    Limit number of invoices to reparse
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseInvoiceWithGPT, ParseResult } from '../lib/gpt/parseInvoice';
import { getDatabase } from '../lib/db/client';
import { v4 as uuidv4 } from 'uuid';

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  failed: args.includes('--failed'),
  all: args.includes('--all'),
  dryRun: args.includes('--dry-run'),
  file: args.find((_, i) => args[i - 1] === '--file'),
  limit: parseInt(args.find((_, i) => args[i - 1] === '--limit') || '0', 10) || 999999,
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  vendor_name: string | null;
  source_file: string;
  pdf_path: string | null;
  parsing_status: string | null;
  parsing_error: string | null;
}

/**
 * Find Dandy invoices that need reparsing
 */
function findDandyInvoices(options: { failed?: boolean; all?: boolean }): InvoiceRow[] {
  const db = getDatabase();
  
  let query: string;
  
  if (options.all) {
    // All Dandy-related invoices
    query = `
      SELECT id, invoice_number, vendor_name, source_file, pdf_path, parsing_status, parsing_error 
      FROM invoices 
      WHERE vendor_name LIKE '%Dandy%' 
         OR source_file LIKE '%Dandy%' 
         OR source_file LIKE '%dandy%'
         OR source_file LIKE '%meetdandy%'
         OR source_file LIKE '%Smiles%Dental%'
    `;
  } else if (options.failed) {
    // Failed or Unknown vendor invoices that might be Dandy
    query = `
      SELECT id, invoice_number, vendor_name, source_file, pdf_path, parsing_status, parsing_error 
      FROM invoices 
      WHERE (parsing_status = 'failed' 
         OR invoice_number LIKE 'FAILED%' 
         OR vendor_name = 'Unknown')
        AND (source_file LIKE '%Dandy%' 
         OR source_file LIKE '%dandy%' 
         OR source_file LIKE '%meetdandy%'
         OR source_file LIKE '%Smiles%'
         OR source_file LIKE '%ZIMA%')
    `;
  } else {
    // Default: Dandy invoices with Unknown vendor or failed status
    query = `
      SELECT id, invoice_number, vendor_name, source_file, pdf_path, parsing_status, parsing_error 
      FROM invoices 
      WHERE (vendor_name = 'Unknown' OR parsing_status = 'failed' OR invoice_number LIKE 'FAILED%')
        AND (source_file LIKE '%Dandy%' 
             OR source_file LIKE '%Smiles%Dental%'
             OR source_file LIKE '%meetdandy%')
    `;
  }
  
  return db.prepare(query).all() as InvoiceRow[];
}

/**
 * Find PDF files that contain Dandy/Smiles and haven't been parsed
 */
function findUnparsedDandyPDFs(): string[] {
  const db = getDatabase();
  const pdfDirs = [
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices'),
    path.join(process.cwd(), 'email_invoices'),
  ];
  
  const unparsed: string[] = [];
  
  // Get all parsed files
  const parsed = new Set<string>();
  const rows = db.prepare('SELECT source_file, pdf_path FROM invoices').all() as Array<{ source_file: string; pdf_path: string }>;
  for (const row of rows) {
    if (row.source_file) parsed.add(path.basename(row.source_file));
    if (row.pdf_path) parsed.add(path.basename(row.pdf_path));
  }
  
  // Scan directories for Dandy-related PDFs
  for (const dir of pdfDirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.pdf')) continue;
      
      // Check if it's a Dandy-related file
      const lowerFile = file.toLowerCase();
      if (lowerFile.includes('dandy') || 
          lowerFile.includes('smiles') || 
          lowerFile.includes('meetdandy') ||
          lowerFile.includes('zima')) {
        
        // Check if not yet parsed
        if (!parsed.has(file)) {
          unparsed.push(path.join(dir, file));
        }
      }
    }
  }
  
  return unparsed;
}

/**
 * Resolve PDF path to filesystem location
 */
function resolvePdfPath(pdfPath: string): string | null {
  if (!pdfPath) return null;
  
  // Extract filename
  const filename = path.basename(pdfPath);
  
  // Try multiple locations
  const possiblePaths = [
    pdfPath,
    path.join(process.cwd(), pdfPath),
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'email_invoices', filename),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

/**
 * Reparse a single invoice
 */
async function reparseInvoice(invoice: InvoiceRow): Promise<{ success: boolean; error?: string }> {
  const pdfPath = resolvePdfPath(invoice.pdf_path || invoice.source_file);
  
  if (!pdfPath) {
    return { success: false, error: `PDF not found: ${invoice.pdf_path || invoice.source_file}` };
  }
  
  log(`  Parsing: ${path.basename(pdfPath)}`, 'cyan');
  
  try {
    // Parse with GPT-5 Nano (vendor hint: Dandy)
    const result: ParseResult = await parseInvoiceWithGPT(pdfPath, 'Dandy');
    
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Parse failed' };
    }
    
    const data = result.data;
    const db = getDatabase();
    
    // Update the invoice record
    const totalCents = data.total ? Math.round(data.total * 100) : null;
    
    db.prepare(`
      UPDATE invoices SET
        parsed_vendor_name = ?,
        vendor_name = COALESCE(corrected_vendor_name, ?),
        parsed_office_id = ?,
        office_location = COALESCE(corrected_office_id, ?),
        parsed_amount_cents = ?,
        amount_cents = COALESCE(corrected_amount_cents, ?),
        total = ?,
        invoice_total = ?,
        invoice_date = ?,
        due_date = ?,
        invoice_number = CASE 
          WHEN invoice_number LIKE 'FAILED%' THEN ?
          ELSE invoice_number
        END,
        parsing_method = 'gpt-5-nano',
        parsing_status = 'success',
        parsing_confidence = ?,
        parsing_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.vendor_name || 'Dandy',
      data.vendor_name || 'Dandy',
      data.office_location,
      data.office_location,
      totalCents,
      totalCents,
      data.total,
      data.total,
      data.invoice_date,
      data.due_date,
      data.invoice_number || invoice.invoice_number,
      data.parsing_confidence || 0.8,
      invoice.id
    );
    
    log(`  ✓ Parsed: ${data.invoice_number || invoice.invoice_number} - $${data.total?.toFixed(2) || '?'} (${data.vendor_name})`, 'green');
    return { success: true };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Parse a new PDF file and save to database
 */
async function parseNewPdf(pdfPath: string): Promise<{ success: boolean; error?: string }> {
  log(`  Parsing new file: ${path.basename(pdfPath)}`, 'cyan');
  
  try {
    // Parse with GPT-5 Nano (vendor hint: Dandy)
    const result: ParseResult = await parseInvoiceWithGPT(pdfPath, 'Dandy');
    
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Parse failed' };
    }
    
    const data = result.data;
    const db = getDatabase();
    const invoiceId = uuidv4();
    const totalCents = data.total ? Math.round(data.total * 100) : null;
    
    // Check for duplicate
    const invoiceNumber = data.invoice_number || `DANDY-${Date.now()}`;
    const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceNumber);
    
    if (existing) {
      log(`  Skipping duplicate: ${invoiceNumber}`, 'yellow');
      return { success: true };
    }
    
    // Insert new invoice
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, source_file, pdf_path,
        parsed_vendor_name, vendor_name,
        parsed_office_id, office_location,
        parsed_amount_cents, amount_cents,
        total, invoice_total,
        invoice_date, due_date,
        status, parsing_method, parsing_status, parsing_confidence,
        deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      invoiceId,
      invoiceNumber,
      pdfPath,
      pdfPath,
      data.vendor_name || 'Dandy',
      data.vendor_name || 'Dandy',
      data.office_location,
      data.office_location,
      totalCents,
      totalCents,
      data.total,
      data.total,
      data.invoice_date,
      data.due_date,
      'pending',
      'gpt-5-nano',
      'success',
      data.parsing_confidence || 0.8,
      0
    );
    
    log(`  ✓ New invoice: ${invoiceNumber} - $${data.total?.toFixed(2) || '?'} (${data.vendor_name})`, 'green');
    return { success: true };
    
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  log('\n🦷 Dandy Invoice Reparser (GPT-5 Nano)', 'blue');
  log('=' .repeat(50), 'blue');
  
  // Check for specific file
  if (flags.file) {
    log(`\nReparsing single file: ${flags.file}`, 'cyan');
    
    if (!fs.existsSync(flags.file)) {
      log(`✗ File not found: ${flags.file}`, 'red');
      process.exit(1);
    }
    
    if (flags.dryRun) {
      log('  [DRY RUN] Would parse this file', 'yellow');
      process.exit(0);
    }
    
    const result = await parseNewPdf(flags.file);
    if (!result.success) {
      log(`✗ Failed: ${result.error}`, 'red');
      process.exit(1);
    }
    
    log('\n✓ Done!', 'green');
    process.exit(0);
  }
  
  // Find invoices to reparse
  log('\nScanning for Dandy invoices...', 'cyan');
  
  const invoices = findDandyInvoices({ failed: flags.failed, all: flags.all });
  const unparsedPdfs = findUnparsedDandyPDFs();
  
  log(`\nFound:`, 'cyan');
  log(`  - ${invoices.length} invoices in database to reparse`, 'cyan');
  log(`  - ${unparsedPdfs.length} unparsed PDF files`, 'cyan');
  
  const total = Math.min(invoices.length + unparsedPdfs.length, flags.limit);
  
  if (total === 0) {
    log('\nNo Dandy invoices need reparsing!', 'green');
    process.exit(0);
  }
  
  if (flags.dryRun) {
    log('\n[DRY RUN] Would reparse:', 'yellow');
    
    let count = 0;
    for (const inv of invoices) {
      if (count >= flags.limit) break;
      log(`  - ${inv.invoice_number} (${inv.vendor_name || 'Unknown'})`, 'yellow');
      count++;
    }
    for (const pdf of unparsedPdfs) {
      if (count >= flags.limit) break;
      log(`  - [NEW] ${path.basename(pdf)}`, 'yellow');
      count++;
    }
    
    log(`\nTotal: ${total} invoices`, 'yellow');
    process.exit(0);
  }
  
  // Reparse invoices
  log(`\nReparsing ${total} invoices using GPT-5 Nano...\n`, 'blue');
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  // First: reparse existing invoices
  for (const invoice of invoices) {
    if (processed >= flags.limit) break;
    
    log(`[${processed + 1}/${total}] Invoice: ${invoice.invoice_number}`, 'cyan');
    
    const result = await reparseInvoice(invoice);
    
    if (result.success) {
      successful++;
    } else {
      failed++;
      log(`  ✗ Error: ${result.error}`, 'red');
    }
    
    processed++;
    
    // Small delay to avoid rate limiting
    if (processed < total) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  // Second: parse new PDFs
  for (const pdfPath of unparsedPdfs) {
    if (processed >= flags.limit) break;
    
    log(`[${processed + 1}/${total}] New PDF: ${path.basename(pdfPath)}`, 'cyan');
    
    const result = await parseNewPdf(pdfPath);
    
    if (result.success) {
      successful++;
    } else {
      failed++;
      log(`  ✗ Error: ${result.error}`, 'red');
    }
    
    processed++;
    
    // Small delay to avoid rate limiting
    if (processed < total) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  // Summary
  log('\n' + '=' .repeat(50), 'blue');
  log('📊 Summary:', 'blue');
  log(`  Total processed: ${processed}`, 'cyan');
  log(`  ✓ Successful: ${successful}`, 'green');
  log(`  ✗ Failed: ${failed}`, failed > 0 ? 'red' : 'cyan');
  log('\n✓ Reparse complete!', 'green');
}

// Run
main().catch(console.error);
