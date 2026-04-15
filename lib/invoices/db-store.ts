import { getDatabase } from '../db/client';
import { createTombstone } from './tombstoneService';

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  source_file?: string;
  source_message_id?: string;
  parsed_vendor_name?: string;
  parsed_office_id?: string;
  parsed_amount_cents?: number;
  corrected_vendor_name?: string;
  corrected_office_id?: string;
  corrected_amount_cents?: number;
  vendor_name?: string;
  office_id?: string;
  amount_cents?: number;
  field_locks?: Record<string, boolean>;
  status: string;
  approvals?: Record<string, any>;
  deleted: number;
  workflow_deleted_at?: string;
  status_version: number;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

/**
 * Get invoice by ID or invoice_number
 */
export function getInvoiceById(id: string): InvoiceRecord | undefined {
  const db = getDatabase();
  const invoice = db.prepare(`
    SELECT * FROM invoices WHERE id = ? OR invoice_number = ?
  `).get(id, id) as any;
  
  if (!invoice) return undefined;
  
  // Parse JSON fields
  return {
    ...invoice,
    field_locks: invoice.field_locks ? JSON.parse(invoice.field_locks) : {},
    approvals: invoice.approvals ? JSON.parse(invoice.approvals) : {},
  };
}

/**
 * Save invoice to database
 * Includes three-stage status tracking fields (Coded -> Approved -> Paid)
 * These timestamps and user IDs are permanently attached to the invoice
 */
export function saveInvoice(invoice: InvoiceRecord): void {
  const db = getDatabase();
  
  db.prepare(`
    UPDATE invoices SET
      vendor_name = ?,
      office_id = ?,
      amount_cents = ?,
      status = ?,
      approvals = ?,
      field_locks = ?,
      status_version = ?,
      coded_at = ?,
      coded_by_user_id = ?,
      approved_at = ?,
      approved_by_user_id = ?,
      ap_approved_at = ?,
      ap_approved_by = ?,
      om_approved_at = ?,
      om_approved_by = ?,
      admin_approved_at = ?,
      admin_approved_by = ?,
      approval_stage = ?,
      paid_at = ?,
      paid_by_user_id = ?,
      stripe_transfer_id = ?,
      qbo_bill_id = ?,
      qbo_bill_created_at = ?,
      current_assigned_user_email = ?,
      verified_by_user_id = ?,
      verified_at = ?,
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    invoice.vendor_name,
    invoice.office_id,
    invoice.amount_cents,
    invoice.status,
    JSON.stringify(invoice.approvals || {}),
    JSON.stringify(invoice.field_locks || {}),
    invoice.status_version,
    invoice.coded_at || null,
    invoice.coded_by_user_id || null,
    invoice.approved_at || null,
    invoice.approved_by_user_id || null,
    invoice.ap_approved_at || null,
    invoice.ap_approved_by || null,
    invoice.om_approved_at || null,
    invoice.om_approved_by || null,
    invoice.admin_approved_at || null,
    invoice.admin_approved_by || null,
    invoice.approval_stage || null,
    invoice.paid_at || null,
    invoice.paid_by_user_id || null,
    invoice.stripe_transfer_id || null,
    invoice.qbo_bill_id || null,
    invoice.qbo_bill_created_at || null,
    invoice.current_assigned_user_email || null,
    invoice.verified_by_user_id || null,
    invoice.verified_at || null,
    invoice.notes ?? null,
    invoice.id
  );
}

/**
 * Soft delete invoice (mark as deleted)
 */
export async function softDeleteInvoice(invoiceId: string, reason?: string): Promise<void> {
  const db = getDatabase();

  const invoice = db.prepare('SELECT source_file, qbo_bill_id FROM invoices WHERE id = ?').get(invoiceId) as any;

  // If a QBO bill exists for this invoice, delete it so it can't be paid
  if (invoice?.qbo_bill_id) {
    try {
      const { qboClient } = await import('@/lib/qbo/qboClient');
      const fullBill = await qboClient.getFullBill(invoice.qbo_bill_id);
      if (fullBill && fullBill.Balance > 0) {
        await qboClient.deleteBill(fullBill.Id, fullBill.SyncToken);
        console.log(`🗑️ Deleted QBO bill ${invoice.qbo_bill_id} for rejected invoice ${invoiceId}`);
      } else if (fullBill && fullBill.Balance === 0) {
        console.warn(`⚠️ QBO bill ${invoice.qbo_bill_id} is already paid — cannot delete`);
      }
    } catch (err) {
      console.error(`❌ Failed to delete QBO bill ${invoice.qbo_bill_id}:`, err);
    }
  }

  db.prepare(`
    UPDATE invoices SET
      deleted = 1,
      workflow_deleted_at = CURRENT_TIMESTAMP,
      status = 'rejected',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(invoiceId);

  // Create tombstone to prevent re-ingestion
  if (invoice?.source_file) {
    createTombstone(invoice.source_file);
  }

  // Audit event
  db.prepare(`
    INSERT INTO invoice_events (invoice_id, action, payload_json)
    VALUES (?, 'REJECTED', ?)
  `).run(invoiceId, JSON.stringify({ reason: reason || 'No reason provided' }));
}

/**
 * Get all visible invoices (not deleted, matching status)
 */
export function getVisibleInvoices(status?: string): InvoiceRecord[] {
  const db = getDatabase();
  
  let query = 'SELECT * FROM invoices WHERE deleted = 0';
  const params: any[] = [];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const invoices = db.prepare(query).all(...params) as any[];
  
  return invoices.map(inv => ({
    ...inv,
    field_locks: inv.field_locks ? JSON.parse(inv.field_locks) : {},
    approvals: inv.approvals ? JSON.parse(inv.approvals) : {},
  }));
}

/**
 * Check if invoice exists
 */
export function invoiceExists(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('SELECT 1 FROM invoices WHERE id = ? OR invoice_number = ?').get(id, id);
  return !!result;
}

/**
 * Get invoice count by status
 */
export function getInvoiceCountByStatus(status: string): number {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE status = ? AND deleted = 0').get(status) as any;
  return result?.count || 0;
}

