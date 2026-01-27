#!/usr/bin/env npx ts-node
/**
 * Invoice Deduplication Script
 * 
 * Scans for duplicate invoices and removes them, keeping the one that is:
 * 1. Furthest along in the workflow (paid > to_be_paid > awaiting_* > incoming)
 * 2. If same status, has the best parsing quality (most complete data)
 * 3. If identical scores, keeps the older one
 * 
 * Usage:
 *   npx ts-node scripts/deduplicate-invoices.ts [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without making changes
 * 
 * For cron (hourly):
 *   0 * * * * cd /var/www/pcs-ui && node scripts/deduplicate-invoices.js >> /var/log/pcs-dedup.log 2>&1
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Status priority - higher number = further along in workflow = keep
const STATUS_PRIORITY: Record<string, number> = {
  'paid': 100,
  'to_be_paid': 80,
  'awaiting_admin_approval': 60,
  'awaiting_office_approval': 50,
  'categorized': 30,
  'coded': 30,
  'incoming': 10,
  'repair': 5,
  'rejected': 1,
  'removed': 0,
};

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  vendor_name: string | null;
  total: number | null;
  invoice_date: string | null;
  office_location: string | null;
  pdf_path: string | null;
  parsing_status: string | null;
  parsing_confidence: number | null;
  created_at: string | null;
}

/**
 * Calculate a score for an invoice based on status and data quality.
 * Higher score = better candidate to keep.
 */
function scoreInvoice(inv: Invoice): number {
  let score = 0;
  
  // Status priority (0-100 range)
  score += STATUS_PRIORITY[inv.status] || 0;
  
  // Parsing quality bonuses
  if (inv.parsing_status === 'success') score += 10;
  if (inv.total && inv.total > 0) score += 5;
  if (inv.vendor_name && inv.vendor_name !== 'Unknown') score += 3;
  if (inv.invoice_date) score += 3;
  if (inv.office_location) score += 2;
  if (inv.pdf_path) score += 2;
  
  // Confidence bonus (0-5 range based on 0-1 confidence)
  if (inv.parsing_confidence) {
    score += Math.round(inv.parsing_confidence * 5);
  }
  
  return score;
}

/**
 * Format timestamp for logging
 */
function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Main deduplication logic
 */
async function deduplicateInvoices(dryRun: boolean = false) {
  console.log(`\n[${timestamp()}] === Invoice Deduplication ${dryRun ? '(DRY RUN)' : ''} ===\n`);
  
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
    console.error('[ERROR] Database not found');
    process.exit(1);
  }
  
  console.log(`[INFO] Database: ${dbPath}`);
  
  const db = new Database(dbPath);
  
  // Disable foreign key checks for safe deletion
  db.pragma('foreign_keys = OFF');
  
  // Get all invoices grouped by invoice_number
  const invoices = db.prepare(`
    SELECT 
      id,
      invoice_number,
      status,
      vendor_name,
      total,
      invoice_date,
      office_location,
      pdf_path,
      parsing_status,
      parsing_confidence,
      created_at
    FROM invoices
    WHERE invoice_number IS NOT NULL
      AND invoice_number != ''
      AND deleted = 0
    ORDER BY invoice_number, created_at
  `).all() as Invoice[];
  
  console.log(`[INFO] Found ${invoices.length} invoices to scan\n`);
  
  // Group by invoice_number
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = inv.invoice_number.trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(inv);
  }
  
  // Find duplicates
  let duplicateGroups = 0;
  let totalDuplicates = 0;
  const toDelete: { id: string; invoice_number: string; reason: string }[] = [];
  
  for (const [invoiceNumber, group] of groups) {
    if (group.length <= 1) continue;
    
    duplicateGroups++;
    
    // Score each invoice
    const scored = group.map(inv => ({
      invoice: inv,
      score: scoreInvoice(inv),
    }));
    
    // Sort by score (desc), then by created_at (asc) for tiebreaker
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Older invoice wins on tie (keep original)
      const aTime = a.invoice.created_at ? new Date(a.invoice.created_at).getTime() : 0;
      const bTime = b.invoice.created_at ? new Date(b.invoice.created_at).getTime() : 0;
      return aTime - bTime;
    });
    
    // Keep the best one, mark others for deletion
    const keep = scored[0];
    const duplicates = scored.slice(1);
    
    console.log(`[DUPLICATE] Invoice #${invoiceNumber}`);
    console.log(`  KEEP: id=${keep.invoice.id.substring(0, 8)}... status=${keep.invoice.status} score=${keep.score}`);
    
    for (const dup of duplicates) {
      const reason = `Duplicate of ${keep.invoice.id.substring(0, 8)}... (score: ${dup.score} vs ${keep.score})`;
      toDelete.push({
        id: dup.invoice.id,
        invoice_number: dup.invoice.invoice_number,
        reason,
      });
      console.log(`  DELETE: id=${dup.invoice.id.substring(0, 8)}... status=${dup.invoice.status} score=${dup.score}`);
      totalDuplicates++;
    }
    console.log('');
  }
  
  // Summary before deletion
  console.log(`[SUMMARY]`);
  console.log(`  Duplicate groups found: ${duplicateGroups}`);
  console.log(`  Total duplicates to delete: ${totalDuplicates}`);
  
  if (totalDuplicates === 0) {
    console.log(`\n[${timestamp()}] No duplicates found. Database is clean.\n`);
    db.close();
    return;
  }
  
  // Perform deletion
  if (!dryRun) {
    console.log(`\n[ACTION] Deleting ${totalDuplicates} duplicate invoices...`);
    
    const deleteStmt = db.prepare('DELETE FROM invoices WHERE id = ?');
    
    let deleted = 0;
    for (const item of toDelete) {
      try {
        deleteStmt.run(item.id);
        deleted++;
      } catch (err: any) {
        console.error(`  [ERROR] Failed to delete ${item.id}: ${err.message}`);
      }
    }
    
    console.log(`[RESULT] Successfully deleted ${deleted}/${totalDuplicates} duplicates`);
  } else {
    console.log(`\n[DRY RUN] Would delete ${totalDuplicates} duplicates. Run without --dry-run to execute.`);
  }
  
  console.log(`\n[${timestamp()}] Deduplication complete.\n`);
  
  db.close();
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Run
deduplicateInvoices(dryRun).catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
