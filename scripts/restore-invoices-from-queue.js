#!/usr/bin/env node

/**
 * Restore invoices from invoice_queue.json into the SQLite database
 * This script reads the invoice queue and imports all invoices into the database
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Determine database path
const dbPath = process.env.PCS_DATA_DIR 
  ? path.join(process.env.PCS_DATA_DIR, 'pcs.db')
  : path.join(__dirname, '..', 'pcs_ui_data', 'pcs.db');

console.log(`[RESTORE] Using database at: ${dbPath}`);

// Open database
const db = new Database(dbPath);

// Read invoice queue
const queuePath = path.join(__dirname, '..', 'pcs_ai_data', 'invoice_queue.json');
console.log(`[RESTORE] Reading invoice queue from: ${queuePath}`);

let invoices = [];
try {
  invoices = require(queuePath);
  if (!Array.isArray(invoices)) {
    invoices = invoices.invoices || [];
  }
} catch (err) {
  console.error(`[RESTORE] Error reading invoice queue: ${err.message}`);
  process.exit(1);
}

console.log(`[RESTORE] Found ${invoices.length} invoices to restore`);

// Prepare insert statement
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO invoices (
    id, invoice_number, vendor_name, office_location,
    amount_cents, status, created_at, updated_at,
    parsed_vendor_name, parsed_office_id, parsed_amount_cents,
    invoice_date, due_date, pdf_path, office_id, clinic_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

db.transaction(() => {
  for (const inv of invoices) {
    try {
      // Generate ID if not present
      const id = inv.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get amount in cents
      let amountCents = 0;
      if (inv.invoice_total) {
        const amount = typeof inv.invoice_total === 'string'
          ? parseFloat(inv.invoice_total)
          : inv.invoice_total;
        amountCents = Math.round(amount * 100);
      }

      // Determine status - default to 'incoming'
      const status = inv.status || 'incoming';

      const now = new Date().toISOString();

      insertStmt.run(
        id,
        inv.invoice_number || inv.invoice || '',
        inv.vendor_name || inv.vendor || 'Unknown',
        inv.office_location || inv.office || inv.clinic_id || '',
        amountCents,
        status,
        inv.created_at || now,
        now,
        inv.vendor_name || inv.vendor || 'Unknown',  // parsed_vendor_name
        inv.office_location || inv.office || inv.clinic_id || '',  // parsed_office_id
        amountCents,  // parsed_amount_cents
        inv.invoice_date || null,  // invoice_date
        inv.due_date || null,  // due_date
        inv.pdf_path || null,  // pdf_path
        inv.office_location || inv.office || inv.clinic_id || '',  // office_id
        inv.clinic_id || null  // clinic_id
      );
      
      imported++;
    } catch (err) {
      console.warn(`[RESTORE] Skipped invoice ${inv.id}: ${err.message}`);
      skipped++;
    }
  }
})();

console.log(`[RESTORE] ✅ Imported ${imported} invoices`);
if (skipped > 0) {
  console.log(`[RESTORE] ⚠️  Skipped ${skipped} invoices`);
}

// Verify
const count = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
console.log(`[RESTORE] Database now contains ${count} total invoices`);

db.close();
console.log(`[RESTORE] Done!`);

