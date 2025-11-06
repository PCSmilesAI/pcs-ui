import { getDatabase } from '../db/client';

export interface InvoiceCorrections {
  vendor_name?: string;
  office_id?: string;
  amount_cents?: number;
}

export interface ParserPayload {
  parsed_vendor_name?: string;
  parsed_office_id?: string;
  parsed_amount_cents?: number;
  [key: string]: any;
}

/**
 * Apply user corrections to an invoice.
 * Sets corrected_* fields and rematerializes effective fields.
 */
export async function applyCorrections(
  invoiceId: string,
  actorEmail: string,
  patch: InvoiceCorrections,
  overrideLocks: boolean = false
): Promise<void> {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    try {
      db.transaction(() => {
        // Get current invoice
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
        if (!invoice) {
          throw new Error(`Invoice ${invoiceId} not found`);
        }
        
        // Parse field_locks
        const locks = invoice.field_locks ? JSON.parse(invoice.field_locks) : {};
        
        // Check locks
        for (const field of Object.keys(patch)) {
          if (locks[field] && !overrideLocks) {
            throw new Error(`Field '${field}' is locked. Use overrideLocks=true to override.`);
          }
        }
        
        // Apply corrections
        const updates: Record<string, any> = {};
        if (patch.vendor_name !== undefined) {
          updates.corrected_vendor_name = patch.vendor_name;
        }
        if (patch.office_id !== undefined) {
          updates.corrected_office_id = patch.office_id;
        }
        if (patch.amount_cents !== undefined) {
          updates.corrected_amount_cents = patch.amount_cents;
        }
        
        if (Object.keys(updates).length > 0) {
          const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
          const values = Object.values(updates);
          db.prepare(`UPDATE invoices SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(...values, invoiceId);
        }
        
        // Rematerialize effective fields
        rematerializeSync(invoiceId);
        
        // Audit event
        db.prepare(`
          INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
          VALUES (?, 'CORRECTED', ?, ?)
        `).run(invoiceId, actorEmail, JSON.stringify(patch));
      })();
      
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Apply parser update to an invoice.
 * Only sets parsed_* fields, respects field_locks.
 */
export async function applyParserUpdate(
  invoiceId: string,
  parserPayload: ParserPayload
): Promise<void> {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    try {
      db.transaction(() => {
        // Get current invoice
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
        if (!invoice) {
          throw new Error(`Invoice ${invoiceId} not found`);
        }
        
        // Parse field_locks
        const locks = invoice.field_locks ? JSON.parse(invoice.field_locks) : {};
        
        // Apply parser updates, respecting locks
        const updates: Record<string, any> = {};
        
        if (parserPayload.parsed_vendor_name !== undefined && !locks.vendor_name) {
          updates.parsed_vendor_name = parserPayload.parsed_vendor_name;
        }
        if (parserPayload.parsed_office_id !== undefined && !locks.office_id) {
          updates.parsed_office_id = parserPayload.parsed_office_id;
        }
        if (parserPayload.parsed_amount_cents !== undefined && !locks.amount_cents) {
          updates.parsed_amount_cents = parserPayload.parsed_amount_cents;
        }
        
        if (Object.keys(updates).length > 0) {
          const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
          const values = Object.values(updates);
          db.prepare(`UPDATE invoices SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(...values, invoiceId);
        }
        
        // Rematerialize effective fields
        rematerializeSync(invoiceId);
        
        // Audit event
        db.prepare(`
          INSERT INTO invoice_events (invoice_id, action, payload_json)
          VALUES (?, 'PARSED_UPDATE', ?)
        `).run(invoiceId, JSON.stringify(parserPayload));
      })();
      
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Rematerialize effective fields from corrected/parsed values.
 * Effective value = corrected_* if not null, else parsed_*
 */
function rematerializeSync(invoiceId: string): void {
  const db = getDatabase();
  
  db.prepare(`
    UPDATE invoices
    SET
      vendor_name = COALESCE(corrected_vendor_name, parsed_vendor_name),
      office_id = COALESCE(corrected_office_id, parsed_office_id),
      amount_cents = COALESCE(corrected_amount_cents, parsed_amount_cents),
      status_version = status_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(invoiceId);
}

export async function rematerialize(invoiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      rematerializeSync(invoiceId);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

