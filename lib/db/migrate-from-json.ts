import { getDatabase } from './client';
import { resolveDataPath } from '../workflow/dataDir';
import { normalizeVendorNameForStorage } from '../invoices/vendorNormalization';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';

/**
 * Migrate invoices from JSON workflow store to SQLite database.
 * This is a one-time operation that populates the database from existing data.
 */
export async function migrateFromJSON(): Promise<{ migrated: number; skipped: number }> {
  const db = getDatabase();

  try {
    // Load existing invoices from JSON
    const storePath = resolveDataPath('workflow_invoices.json');
    let jsonInvoices: any[] = [];

    try {
      const buf = await fs.readFile(storePath, 'utf8');
      const store = JSON.parse(buf);
      jsonInvoices = store.invoices || [];
    } catch (err) {
      console.log('[DB][MIGRATE]', 'No workflow_invoices.json found, skipping data migration');
      return { migrated: 0, skipped: 0 };
    }
    
    console.log('[DB][MIGRATE]', 'Starting migration from JSON', { count: jsonInvoices.length });
    
    let migrated = 0;
    let skipped = 0;
    
    db.transaction(() => {
      for (const jsonInv of jsonInvoices) {
        try {
          // Check if already exists
          const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?')
            .get(jsonInv.invoice_number);
          
          if (existing) {
            skipped++;
            continue;
          }
          
          // Generate ID if not present
          const id = jsonInv.id || randomUUID();

          // Normalize vendor name
          const normalizedVendor = normalizeVendorNameForStorage(jsonInv.vendor_name);

          // Insert invoice with parsed values (from JSON)
          db.prepare(`
            INSERT INTO invoices (
              id,
              invoice_number,
              source_file,
              source_message_id,
              parsed_vendor_name,
              parsed_office_id,
              parsed_amount_cents,
              vendor_name,
              office_id,
              amount_cents,
              status,
              approvals,
              deleted,
              workflow_deleted_at,
              invoice_date,
              due_date,
              description,
              category,
              clinic_id,
              office_location,
              vendor_id,
              pdf_path,
              total,
              invoice_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            jsonInv.invoice_number,
            jsonInv.source_file,
            jsonInv.source_message_id,
            normalizedVendor,  // parsed (normalized)
            jsonInv.office_id,    // parsed
            jsonInv.amount_cents, // parsed
            normalizedVendor,  // effective (same as parsed initially, normalized)
            jsonInv.office_id,    // effective
            jsonInv.amount_cents, // effective
            jsonInv.status || 'incoming',
            JSON.stringify(jsonInv.approvals || {}),
            jsonInv.deleted ? 1 : 0,
            jsonInv.workflow_deleted_at,
            jsonInv.invoice_date,
            jsonInv.due_date,
            jsonInv.description,
            jsonInv.category,
            jsonInv.clinic_id,
            jsonInv.office_location,
            jsonInv.vendor_id,
            jsonInv.pdf_path,
            jsonInv.total,
            jsonInv.invoice_total
          );
          
          migrated++;
        } catch (err: any) {
          console.error('[DB][MIGRATE]', 'Error migrating invoice', { 
            invoiceNumber: jsonInv.invoice_number, 
            error: err?.message 
          });
        }
      }
    })();
    
    console.log('[DB][MIGRATE]', 'Migration completed', { migrated, skipped });
    return { migrated, skipped };
  } catch (err: any) {
    console.error('[DB][MIGRATE]', 'Migration failed', { error: err?.message });
    throw err;
  }
}

/**
 * Check if migration has already been done.
 */
export function isMigrationNeeded(): boolean {
  const db = getDatabase();
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM invoices').get() as any;
    return count.count === 0;
  } catch {
    return true;
  }
}

