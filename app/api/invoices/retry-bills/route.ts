import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { createBillFromInvoice } from '../../../../lib/qbo/billCreationService';
import { getDatabase } from '../../../../lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/retry-bills
 * Retries QBO bill creation for all to_be_paid invoices that are missing a qbo_bill_id.
 * Use after re-authenticating with QuickBooks.
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Only admins can retry bill creation' }, { status: 403 });
  }

  const db = getDatabase();

  const invoices = db.prepare(`
    SELECT id, invoice_number, vendor_name, amount_cents, office_location,
           invoice_date, due_date, pdf_path, source_file, status, qbo_bill_id
    FROM invoices
    WHERE status = 'to_be_paid'
      AND deleted = 0
      AND (qbo_bill_id IS NULL OR qbo_bill_id = '')
  `).all() as any[];

  if (invoices.length === 0) {
    return NextResponse.json({ ok: true, message: 'All to_be_paid invoices already have QBO bills', retried: 0 });
  }

  console.log(`[RETRY-BILLS] Retrying bill creation for ${invoices.length} invoices`);

  const results: Array<{ id: string; invoice_number: string; ok: boolean; billId?: string; error?: string }> = [];

  for (const invoice of invoices) {
    try {
      const billResult = await createBillFromInvoice({
        invoiceData: invoice,
        invoiceId: invoice.id,
      });

      if (billResult.success && billResult.billId) {
        db.prepare(`
          UPDATE invoices SET qbo_bill_id = ?, qbo_bill_created_at = ? WHERE id = ?
        `).run(billResult.billId, new Date().toISOString(), invoice.id);

        results.push({ id: invoice.id, invoice_number: invoice.invoice_number, ok: true, billId: billResult.billId });
        console.log(`[RETRY-BILLS] Created bill for ${invoice.invoice_number}: billId=${billResult.billId}`);
      } else {
        results.push({ id: invoice.id, invoice_number: invoice.invoice_number, ok: false, error: billResult.error || 'Unknown error' });
        console.warn(`[RETRY-BILLS] Failed for ${invoice.invoice_number}: ${billResult.error}`);
      }
    } catch (err: any) {
      results.push({ id: invoice.id, invoice_number: invoice.invoice_number, ok: false, error: err.message || String(err) });
      console.error(`[RETRY-BILLS] Error for ${invoice.invoice_number}:`, err);
    }
  }

  const successCount = results.filter(r => r.ok).length;
  const failCount = results.filter(r => !r.ok).length;

  return NextResponse.json({
    ok: true,
    message: `Retried ${invoices.length} invoices: ${successCount} succeeded, ${failCount} failed`,
    retried: invoices.length,
    succeeded: successCount,
    failed: failCount,
    results,
  });
}
