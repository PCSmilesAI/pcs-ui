#!/usr/bin/env npx ts-node
/**
 * Date Normalization Migration Script
 * 
 * Converts all invoice dates from YYYY-MM-DD format to MM/DD/YYYY format.
 * 
 * Usage:
 *   npx ts-node scripts/normalize-dates.ts [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be updated without making changes
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Date conversion functions (standalone for script use)
function isYYYYMMDD(dateInput: string | null): boolean {
  if (!dateInput || typeof dateInput !== 'string') {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim());
}

function isMMDDYYYY(dateInput: string | null): boolean {
  if (!dateInput || typeof dateInput !== 'string') {
    return false;
  }
  return /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput.trim());
}

function convertYYYYMMDDtoMMDDYYYY(dateInput: string): string | null {
  if (!dateInput || !isYYYYMMDD(dateInput)) {
    return null;
  }
  
  const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

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
  invoice_date: string | null;
  due_date: string | null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  log('\n=== Date Normalization Migration ===\n', 'blue');
  
  if (dryRun) {
    log('DRY RUN MODE - No changes will be made\n', 'yellow');
  }
  
  // Find database
  const possiblePaths = [
    path.join(process.cwd(), 'pcs_ui_data', 'pcs.db'),
    '/var/www/pcs-ui/pcs_ui_data/pcs.db',
  ];
  
  let dbPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      dbPath = p;
      break;
    }
  }
  
  if (!dbPath) {
    log('ERROR: Database not found', 'red');
    process.exit(1);
  }
  
  log(`Database: ${dbPath}`, 'cyan');
  
  const db = new Database(dbPath);
  
  // Get all invoices with dates
  const invoices = db.prepare(`
    SELECT id, invoice_number, invoice_date, due_date 
    FROM invoices 
    WHERE invoice_date IS NOT NULL OR due_date IS NOT NULL
  `).all() as InvoiceRow[];
  
  log(`\nFound ${invoices.length} invoices with date fields\n`, 'cyan');
  
  let stats = {
    invoiceDateConverted: 0,
    dueDateConverted: 0,
    alreadyCorrect: 0,
    skipped: 0,
    errors: 0,
  };
  
  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE invoices 
    SET invoice_date = ?, due_date = ?
    WHERE id = ?
  `);
  
  // Process each invoice
  for (const invoice of invoices) {
    let invoiceDate = invoice.invoice_date;
    let dueDate = invoice.due_date;
    let needsUpdate = false;
    
    // Check and convert invoice_date
    if (invoiceDate) {
      if (isYYYYMMDD(invoiceDate)) {
        const converted = convertYYYYMMDDtoMMDDYYYY(invoiceDate);
        if (converted) {
          invoiceDate = converted;
          stats.invoiceDateConverted++;
          needsUpdate = true;
        }
      } else if (isMMDDYYYY(invoiceDate)) {
        stats.alreadyCorrect++;
      } else {
        // Unknown format - skip
        stats.skipped++;
        if (!dryRun) {
          log(`  SKIP: Unknown date format for invoice ${invoice.invoice_number}: ${invoiceDate}`, 'yellow');
        }
      }
    }
    
    // Check and convert due_date
    if (dueDate) {
      if (isYYYYMMDD(dueDate)) {
        const converted = convertYYYYMMDDtoMMDDYYYY(dueDate);
        if (converted) {
          dueDate = converted;
          stats.dueDateConverted++;
          needsUpdate = true;
        }
      } else if (isMMDDYYYY(dueDate)) {
        // Already in correct format
      } else {
        // Unknown format - skip
        if (!dryRun) {
          log(`  SKIP: Unknown due date format for invoice ${invoice.invoice_number}: ${dueDate}`, 'yellow');
        }
      }
    }
    
    // Update if needed
    if (needsUpdate && !dryRun) {
      try {
        updateStmt.run(invoiceDate, dueDate, invoice.id);
      } catch (err: any) {
        stats.errors++;
        log(`  ERROR: Failed to update invoice ${invoice.invoice_number}: ${err.message}`, 'red');
      }
    }
  }
  
  // Print summary
  log('\n=== Summary ===\n', 'blue');
  log(`Total invoices processed: ${invoices.length}`, 'cyan');
  log(`Invoice dates converted: ${stats.invoiceDateConverted}`, 'green');
  log(`Due dates converted: ${stats.dueDateConverted}`, 'green');
  log(`Already in MM/DD/YYYY format: ${stats.alreadyCorrect}`, 'cyan');
  log(`Skipped (unknown format): ${stats.skipped}`, 'yellow');
  log(`Errors: ${stats.errors}`, stats.errors > 0 ? 'red' : 'cyan');
  
  if (dryRun) {
    log('\nDRY RUN COMPLETE - Run without --dry-run to apply changes', 'yellow');
  } else {
    log('\nMigration complete!', 'green');
  }
  
  db.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
