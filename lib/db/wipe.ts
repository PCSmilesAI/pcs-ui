/**
 * Safe Database Wipe Functions
 * 
 * Functions to clear invoice-related data while preserving
 * configuration tables (users, roles, clinics, knowledge bases).
 */

import { getDatabase } from './client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tables that will be wiped during a full invoice reset
 * Order matters: tables with foreign keys to invoices must be deleted first
 */
const INVOICE_TABLES = [
  'invoice_categories',
  'invoice_events',
  'invoice_allocations',
  'table_template_rows',
  'invoices',  // Delete invoices LAST due to foreign key constraints
];

/**
 * Tables that are preserved (NOT wiped)
 */
const PRESERVED_TABLES = [
  'users',
  'roles_config',
  'clinics',
  'vendors',
  'coding_templates',
  'vendor_knowledge_bases',
  'system_prompts',
];

/**
 * Get count of records in a table
 */
export function getTableCount(tableName: string): number {
  const db = getDatabase();
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
    return result?.count || 0;
  } catch {
    return 0;
  }
}

/**
 * Get current database stats before wipe
 */
export function getDatabaseStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const table of [...INVOICE_TABLES, ...PRESERVED_TABLES]) {
    stats[table] = getTableCount(table);
  }
  return stats;
}

/**
 * Wipe all invoice-related data from the database
 * 
 * This clears:
 * - invoices
 * - invoice_categories
 * - invoice_events
 * - invoice_allocations
 * 
 * It preserves:
 * - users, roles_config
 * - clinics, vendors
 * - coding_templates
 * - vendor_knowledge_bases, system_prompts
 */
export function wipeInvoiceData(options?: { 
  keepKnowledgeBases?: boolean;
  dryRun?: boolean;
}): { 
  success: boolean; 
  wipedTables: string[]; 
  recordsDeleted: Record<string, number>;
  error?: string;
} {
  const { keepKnowledgeBases = true, dryRun = false } = options || {};
  const db = getDatabase();
  const recordsDeleted: Record<string, number> = {};
  const wipedTables: string[] = [];

  try {
    // Get counts before wipe
    for (const table of INVOICE_TABLES) {
      recordsDeleted[table] = getTableCount(table);
    }

    if (dryRun) {
      console.log('[WIPE] Dry run - would delete:');
      for (const [table, count] of Object.entries(recordsDeleted)) {
        console.log(`  - ${table}: ${count} records`);
      }
      return { success: true, wipedTables: INVOICE_TABLES, recordsDeleted };
    }

    // Wipe invoice tables
    console.log('[WIPE] Starting database wipe...');
    
    for (const table of INVOICE_TABLES) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
        wipedTables.push(table);
        console.log(`[WIPE] Cleared ${table}: ${recordsDeleted[table]} records deleted`);
      } catch (err: any) {
        console.warn(`[WIPE] Could not clear ${table}: ${err.message}`);
      }
    }

    // Optionally wipe knowledge bases (default: keep them)
    if (!keepKnowledgeBases) {
      const kbCount = getTableCount('vendor_knowledge_bases');
      db.prepare('DELETE FROM vendor_knowledge_bases').run();
      recordsDeleted['vendor_knowledge_bases'] = kbCount;
      wipedTables.push('vendor_knowledge_bases');
      console.log(`[WIPE] Cleared vendor_knowledge_bases: ${kbCount} records deleted`);
    }

    console.log('[WIPE] Database wipe complete');
    return { success: true, wipedTables, recordsDeleted };

  } catch (error: any) {
    console.error('[WIPE] Database wipe failed:', error.message);
    return { 
      success: false, 
      wipedTables, 
      recordsDeleted,
      error: error.message 
    };
  }
}

/**
 * Wipe vendor history JSON files
 */
export function wipeVendorHistory(options?: { dryRun?: boolean }): {
  success: boolean;
  filesDeleted: string[];
  error?: string;
} {
  const { dryRun = false } = options || {};
  const historyDir = path.join(process.cwd(), 'vendor_history');
  const filesDeleted: string[] = [];

  try {
    if (!fs.existsSync(historyDir)) {
      console.log('[WIPE] vendor_history directory does not exist');
      return { success: true, filesDeleted };
    }

    const files = fs.readdirSync(historyDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (dryRun) {
      console.log('[WIPE] Dry run - would delete vendor history files:');
      for (const file of jsonFiles) {
        console.log(`  - ${file}`);
      }
      return { success: true, filesDeleted: jsonFiles };
    }

    for (const file of jsonFiles) {
      const filePath = path.join(historyDir, file);
      fs.unlinkSync(filePath);
      filesDeleted.push(file);
      console.log(`[WIPE] Deleted ${file}`);
    }

    console.log(`[WIPE] Deleted ${filesDeleted.length} vendor history files`);
    return { success: true, filesDeleted };

  } catch (error: any) {
    console.error('[WIPE] Vendor history wipe failed:', error.message);
    return { success: false, filesDeleted, error: error.message };
  }
}

/**
 * Full wipe - clears all invoice data and vendor history
 */
export function fullWipe(options?: {
  keepKnowledgeBases?: boolean;
  dryRun?: boolean;
}): {
  success: boolean;
  database: ReturnType<typeof wipeInvoiceData>;
  history: ReturnType<typeof wipeVendorHistory>;
} {
  const dbResult = wipeInvoiceData(options);
  const historyResult = wipeVendorHistory(options);

  return {
    success: dbResult.success && historyResult.success,
    database: dbResult,
    history: historyResult,
  };
}

/**
 * Reset sequence counters (if any) after wipe
 */
export function resetSequences(): void {
  const db = getDatabase();
  try {
    // SQLite doesn't have sequences, but reset autoincrement if needed
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('invoices', 'invoice_categories', 'invoice_events')").run();
    console.log('[WIPE] Reset sequence counters');
  } catch {
    // sqlite_sequence may not exist if no autoincrement was used
  }
}
