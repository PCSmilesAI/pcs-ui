#!/usr/bin/env npx ts-node
/**
 * False Invoice Migration Script
 * 
 * Takes the output from analyze-all-emails.ts and migrates false invoices
 * (credit memos, statements, etc.) from the invoices table to the 
 * other_documents table.
 * 
 * Usage:
 *   npx tsx scripts/migrate-false-invoices.ts [options]
 * 
 * Options:
 *   --input=FILE     Input file with false invoices (default: false_invoices.json)
 *   --dry-run        Show what would be done without making changes
 *   --help           Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
import 'dotenv/config';

import { getDatabase } from '../lib/db/client';

// ============================================================================
// Types
// ============================================================================

interface FalseInvoice {
  invoiceId: string;
  invoiceNumber: string;
  sourceMessageId: string;
  pdfPath: string;
  vendorName: string | null;
  amount: number | null;
  classification: {
    document_type: string;
    confidence: number;
    reasoning: string;
  };
  emailSubject: string;
  emailFrom: string;
}

interface InputFile {
  generatedAt: string;
  totalFalseInvoices: number;
  falseInvoices: FalseInvoice[];
}

interface CLIOptions {
  input: string;
  dryRun: boolean;
  help: boolean;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    input: 'false_invoices.json',
    dryRun: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--input=')) {
      options.input = arg.split('=')[1];
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
False Invoice Migration Script

Migrates false invoices from the invoices table to the other_documents table.

Usage:
  npx tsx scripts/migrate-false-invoices.ts [options]

Options:
  --input=FILE     Input file with false invoices (default: false_invoices.json)
  --dry-run        Show what would be done without making changes
  --help, -h       Show this help message

Examples:
  # Migrate using default input file
  npx tsx scripts/migrate-false-invoices.ts

  # Dry run to see what would be migrated
  npx tsx scripts/migrate-false-invoices.ts --dry-run

  # Use specific input file
  npx tsx scripts/migrate-false-invoices.ts --input=my_false_invoices.json
`);
}

// ============================================================================
// Migration Logic
// ============================================================================

interface InvoiceFullRecord {
  id: string;
  invoice_number: string;
  source_message_id: string | null;
  pdf_path: string | null;
  vendor_name: string | null;
  amount_cents: number | null;
  invoice_date: string | null;
  due_date: string | null;
  description: string | null;
  category: string | null;
  office_location: string | null;
  created_at: string | null;
}

function getFullInvoiceRecord(invoiceId: string): InvoiceFullRecord | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT 
      id, invoice_number, source_message_id, pdf_path, vendor_name, 
      amount_cents, invoice_date, due_date, description, category,
      office_location, created_at
    FROM invoices
    WHERE id = ?
  `).get(invoiceId) as InvoiceFullRecord | undefined;
  return result || null;
}

function insertOtherDocument(
  invoice: InvoiceFullRecord,
  classification: FalseInvoice['classification'],
  emailSubject: string,
  emailFrom: string
): string {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO other_documents (
      id, document_type, vendor_name, amount, document_date,
      reference_number, pdf_path, source_email_id, email_subject,
      email_from, classification_confidence, raw_extracted_data,
      status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    classification.document_type,
    invoice.vendor_name,
    invoice.amount_cents ? invoice.amount_cents / 100 : null,
    invoice.invoice_date,
    invoice.invoice_number,
    invoice.pdf_path,
    invoice.source_message_id,
    emailSubject,
    emailFrom,
    classification.confidence,
    JSON.stringify({
      original_invoice_id: invoice.id,
      original_description: invoice.description,
      original_category: invoice.category,
      classification_reasoning: classification.reasoning,
      migrated_from_invoices: true,
      migration_date: now,
    }),
    'pending',
    `Migrated from invoices table. Originally classified incorrectly. Reason: ${classification.reasoning}`,
    invoice.created_at || now,
    now
  );
  
  return id;
}

function deleteInvoice(invoiceId: string): void {
  const db = getDatabase();
  
  // First, delete related records
  try {
    db.prepare('DELETE FROM invoice_categories WHERE invoice_id = ?').run(invoiceId);
  } catch {
    // Table might not exist or no records
  }
  
  try {
    db.prepare('DELETE FROM invoice_approvals WHERE invoice_id = ?').run(invoiceId);
  } catch {
    // Table might not exist or no records
  }
  
  // Delete the invoice
  db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
}

function addTombstone(sourceMessageId: string): void {
  const db = getDatabase();
  
  try {
    db.prepare(`
      INSERT OR IGNORE INTO tombstones (source_message_id, deleted_at)
      VALUES (?, ?)
    `).run(sourceMessageId, new Date().toISOString());
  } catch (err) {
    // Tombstones table might not exist
    console.warn('[WARN] Could not add tombstone:', err);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('');
  console.log('========================================');
  console.log('False Invoice Migration');
  console.log('========================================');
  console.log('');
  
  // Load input file
  const inputPath = path.join(process.cwd(), options.input);
  
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error('');
    console.error('Run the analysis script first:');
    console.error('  npx tsx scripts/analyze-all-emails.ts');
    process.exit(1);
  }
  
  let inputData: InputFile;
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    inputData = JSON.parse(content);
  } catch (err) {
    console.error('Error: Failed to parse input file:', err);
    process.exit(1);
  }
  
  console.log(`Input file: ${inputPath}`);
  console.log(`Generated at: ${inputData.generatedAt}`);
  console.log(`Total false invoices: ${inputData.totalFalseInvoices}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');
  
  if (inputData.falseInvoices.length === 0) {
    console.log('No false invoices to migrate.');
    process.exit(0);
  }
  
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const falseInvoice of inputData.falseInvoices) {
    console.log(`[${migrated + failed + skipped + 1}/${inputData.totalFalseInvoices}] ${falseInvoice.invoiceNumber}`);
    console.log(`  Type: ${falseInvoice.classification.document_type}`);
    console.log(`  Vendor: ${falseInvoice.vendorName || 'Unknown'}`);
    console.log(`  Amount: ${falseInvoice.amount ? `$${falseInvoice.amount.toFixed(2)}` : 'N/A'}`);
    
    if (options.dryRun) {
      console.log('  [DRY-RUN] Would migrate to other_documents');
      skipped++;
      continue;
    }
    
    try {
      // Get full invoice record
      const invoice = getFullInvoiceRecord(falseInvoice.invoiceId);
      
      if (!invoice) {
        console.log('  [SKIP] Invoice not found in database (may already be deleted)');
        skipped++;
        continue;
      }
      
      // Insert into other_documents
      const newDocId = insertOtherDocument(
        invoice,
        falseInvoice.classification,
        falseInvoice.emailSubject,
        falseInvoice.emailFrom
      );
      console.log(`  [MIGRATED] New document ID: ${newDocId}`);
      
      // Delete from invoices
      deleteInvoice(falseInvoice.invoiceId);
      console.log('  [DELETED] Removed from invoices table');
      
      // Add tombstone to prevent re-import
      if (falseInvoice.sourceMessageId) {
        addTombstone(falseInvoice.sourceMessageId);
        console.log('  [TOMBSTONE] Added to prevent re-import');
      }
      
      migrated++;
      
    } catch (err: any) {
      console.error(`  [ERROR] Migration failed: ${err.message}`);
      failed++;
    }
  }
  
  console.log('');
  console.log('========================================');
  console.log('Migration Complete');
  console.log('========================================');
  console.log(`Migrated:  ${migrated}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Skipped:   ${skipped}`);
  console.log('');
  
  if (migrated > 0) {
    console.log('False invoices have been moved to the Other Documents page.');
    console.log('You can now run the full reparse:');
    console.log('  npx tsx scripts/bulk-reparse-gpt.ts --wipe --high-quality --max-retries=3');
  }
}

main();
