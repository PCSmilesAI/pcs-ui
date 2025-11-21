#!/usr/bin/env node

/**
 * Migration script to add current_assigned_user_email column to invoices table
 * This is needed for the invoice reassignment feature
 */

const Database = require('better-sqlite3');
const path = require('path');

// Determine database path
const dbPath = process.env.PCS_DATA_DIR 
  ? path.join(process.env.PCS_DATA_DIR, 'pcs.db')
  : '/var/www/pcs-ui-data/pcs.db';

console.log(`[MIGRATION] Opening database at: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  console.log('[MIGRATION] Adding current_assigned_user_email column...');
  db.exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS current_assigned_user_email TEXT;`);
  
  console.log('[MIGRATION] Creating index on current_assigned_user_email...');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_assigned_user ON invoices(current_assigned_user_email);`);
  
  console.log('[MIGRATION] ✅ Migration completed successfully');
  
  // Verify the column exists
  const columns = db.prepare(`PRAGMA table_info(invoices)`).all();
  const hasColumn = columns.some(col => col.name === 'current_assigned_user_email');
  
  if (hasColumn) {
    console.log('[MIGRATION] ✅ Column verified to exist');
  } else {
    console.error('[MIGRATION] ❌ Column verification failed');
    process.exit(1);
  }
  
  db.close();
  process.exit(0);
} catch (error) {
  console.error('[MIGRATION] ❌ Migration failed:', error.message);
  process.exit(1);
}

