import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { getInvoiceById, saveInvoice } from '../../../../lib/invoices/db-store';
import { QBOClient } from '../../../../lib/qbo/qboClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/cron-verify-payments
 *
 * Automated payment verification — runs on a schedule.
 * Finds all invoices with status 'to_be_paid' that have a qbo_bill_id,
 * checks each bill's balance in QBO, and marks invoices as 'paid'
 * when the balance reaches 0.
 *
 * Protected by a shared secret in the CRON_SECRET env var.
 * Call with: ?secret=<CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET || 'pcs-cron-verify-2024';

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[CRON_VERIFY] Starting automatic payment verification...');

  try {
    const db = getDatabase();

    // Find all to_be_paid invoices that have a QBO bill attached
    const pendingInvoices = db.prepare(`
      SELECT id, invoice_number, qbo_bill_id, vendor_name
      FROM invoices
      WHERE status = 'to_be_paid'
        AND qbo_bill_id IS NOT NULL
        AND qbo_bill_id != ''
        AND deleted = 0
    `).all() as Array<{ id: string; invoice_number: string; qbo_bill_id: string; vendor_name: string }>;

    if (pendingInvoices.length === 0) {
      console.log('[CRON_VERIFY] No pending invoices with QBO bills to verify');
      return NextResponse.json({
        ok: true,
        checked: 0,
        paid: [],
        unpaid: [],
        errors: [],
        elapsed_ms: Date.now() - startTime,
      });
    }

    console.log(`[CRON_VERIFY] Found ${pendingInvoices.length} invoices to check`);

    // Initialize QBO client
    const qboClient = new QBOClient();
    await qboClient.initialize();

    const paid: string[] = [];
    const unpaid: string[] = [];
    const errors: string[] = [];

    for (const row of pendingInvoices) {
      try {
        const bill = await qboClient.getBillById(row.qbo_bill_id);

        if (!bill) {
          errors.push(`${row.invoice_number}: QBO bill ${row.qbo_bill_id} not found`);
          unpaid.push(row.id);
          continue;
        }

        if (bill.Balance === 0) {
          // Bill is fully paid — update invoice status
          const invoice = getInvoiceById(row.id);
          if (invoice) {
            invoice.status = 'paid';
            invoice.paid_at = new Date().toISOString();
            (invoice as any).payment_verified_at = new Date().toISOString();
            saveInvoice(invoice);
            paid.push(row.id);
            console.log(`[CRON_VERIFY] ✓ ${row.invoice_number} (${row.vendor_name}) → PAID`);
          }
        } else {
          unpaid.push(row.id);
        }
      } catch (err: any) {
        const msg = `${row.invoice_number}: ${err?.message || 'check failed'}`;
        console.error(`[CRON_VERIFY] ✗ ${msg}`);
        errors.push(msg);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[CRON_VERIFY] Done in ${elapsed}ms — ${paid.length} paid, ${unpaid.length} still pending, ${errors.length} errors`);

    return NextResponse.json({
      ok: true,
      checked: pendingInvoices.length,
      paid,
      unpaid,
      errors,
      elapsed_ms: elapsed,
    });
  } catch (err: any) {
    console.error('[CRON_VERIFY] Fatal error:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
