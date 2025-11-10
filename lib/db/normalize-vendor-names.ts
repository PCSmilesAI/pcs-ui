/**
 * Migration to normalize existing vendor names in the database
 * This consolidates vendor names like "exodus_dental_solutions" and "Exodus Dental Solutions"
 * into a single canonical format
 */

import { getDatabase } from './client';
import { normalizeVendorNameForStorage } from '../invoices/vendorNormalization';

export function normalizeExistingVendorNames(): { updated: number; errors: number } {
  const db = getDatabase();
  let updated = 0;
  let errors = 0;

  try {
    console.log('[DB][NORMALIZE]', 'Starting vendor name normalization...');

    // Get all unique vendor names currently in the database
    const vendors = db.prepare(`
      SELECT DISTINCT vendor_name FROM invoices WHERE vendor_name IS NOT NULL
    `).all() as Array<{ vendor_name: string }>;

    console.log('[DB][NORMALIZE]', `Found ${vendors.length} unique vendor names`);

    // Create a mapping of old names to normalized names
    const vendorMap = new Map<string, string>();
    for (const row of vendors) {
      const oldName = row.vendor_name;
      const normalizedName = normalizeVendorNameForStorage(oldName);
      if (oldName !== normalizedName) {
        vendorMap.set(oldName, normalizedName);
      }
    }

    console.log('[DB][NORMALIZE]', `Found ${vendorMap.size} vendor names that need normalization`);

    // Update all invoices with non-normalized vendor names
    db.transaction(() => {
      for (const [oldName, normalizedName] of vendorMap.entries()) {
        try {
          // Update vendor_name (effective field)
          const result = db.prepare(`
            UPDATE invoices 
            SET vendor_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE vendor_name = ?
          `).run(normalizedName, oldName);

          const changes = (result as any).changes || 0;
          if (changes > 0) {
            console.log('[DB][NORMALIZE]', `Updated ${changes} invoices: "${oldName}" → "${normalizedName}"`);
            updated += changes;
          }

          // Also update parsed_vendor_name if it matches
          const parsedResult = db.prepare(`
            UPDATE invoices 
            SET parsed_vendor_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE parsed_vendor_name = ?
          `).run(normalizedName, oldName);

          const parsedChanges = (parsedResult as any).changes || 0;
          if (parsedChanges > 0) {
            console.log('[DB][NORMALIZE]', `Updated ${parsedChanges} parsed vendor names: "${oldName}" → "${normalizedName}"`);
          }
        } catch (err) {
          console.error('[DB][NORMALIZE]', `Error updating vendor "${oldName}":`, err);
          errors++;
        }
      }
    })();

    console.log('[DB][NORMALIZE]', `Normalization complete. Updated: ${updated}, Errors: ${errors}`);
    return { updated, errors };
  } catch (err) {
    console.error('[DB][NORMALIZE]', 'Fatal error during normalization:', err);
    return { updated, errors: errors + 1 };
  }
}

