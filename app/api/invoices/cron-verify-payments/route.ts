import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { getInvoiceById } from '../../../../lib/invoices/db-store';
import { QBOClient } from '../../../../lib/qbo/qboClient';
import {
  backfillQboBillPaymentId,
  verifyAndMarkInvoicePaidFromQbo,
} from '../../../../lib/qbo/verifyInvoicePayment';

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
 * Also backfills QBO BillPayment IDs on paid invoices missing receipt links.
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

    const pendingInvoices = db.prepare(`
      SELECT id, invoice_number, qbo_bill_id, vendor_name
      FROM invoices
      WHERE status = 'to_be_paid'
        AND qbo_bill_id IS NOT NULL
        AND qbo_bill_id != ''
        AND deleted = 0
    `).all() as Array<{ id: string; invoice_number: string; qbo_bill_id: string; vendor_name: string }>;

    const qboClient = new QBOClient();
    await qboClient.initialize();

    const paid: string[] = [];
    const unpaid: string[] = [];
    const errors: string[] = [];

    if (pendingInvoices.length > 0) {
      console.log(`[CRON_VERIFY] Found ${pendingInvoices.length} invoices to check`);

      for (const row of pendingInvoices) {
        try {
          const invoice = getInvoiceById(row.id);
          if (!invoice) {
            errors.push(`${row.invoice_number}: invoice not found`);
            unpaid.push(row.id);
            continue;
          }

          const result = await verifyAndMarkInvoicePaidFromQbo(invoice, qboClient);
          if (result.paid) {
            paid.push(row.id);
            console.log(
              `[CRON_VERIFY] ✓ ${row.invoice_number} (${row.vendor_name}) → PAID` +
                (result.paymentId ? ` [BillPayment ${result.paymentId}]` : '')
            );
          } else {
            unpaid.push(row.id);
          }
        } catch (err: any) {
          const msg = `${row.invoice_number}: ${err?.message || 'check failed'}`;
          console.error(`[CRON_VERIFY] ✗ ${msg}`);
          errors.push(msg);
        }
      }
    } else {
      console.log('[CRON_VERIFY] No pending invoices with QBO bills to verify');
    }

    // Backfill receipt links for paid invoices that predate payment ID tracking
    const paidMissingReceipt = db.prepare(`
      SELECT id, invoice_number
      FROM invoices
      WHERE status IN ('paid', 'completed')
        AND qbo_bill_id IS NOT NULL
        AND qbo_bill_id != ''
        AND (qbo_bill_payment_id IS NULL OR qbo_bill_payment_id = '')
        AND deleted = 0
      LIMIT 20
    `).all() as Array<{ id: string; invoice_number: string }>;

    let backfilled = 0;
    for (const row of paidMissingReceipt) {
      try {
        const invoice = getInvoiceById(row.id);
        if (!invoice) continue;
        const paymentId = await backfillQboBillPaymentId(invoice, qboClient);
        if (paymentId) {
          backfilled++;
          console.log(`[CRON_VERIFY] Backfilled BillPayment ${paymentId} for ${row.invoice_number}`);
        }
      } catch (err: any) {
        errors.push(`${row.invoice_number}: backfill failed — ${err?.message || 'unknown'}`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[CRON_VERIFY] Done in ${elapsed}ms — ${paid.length} paid, ${unpaid.length} still pending, ${backfilled} receipt links backfilled, ${errors.length} errors`
    );

    return NextResponse.json({
      ok: true,
      checked: pendingInvoices.length,
      paid,
      unpaid,
      backfilled,
      errors,
      elapsed_ms: elapsed,
    });
  } catch (err: any) {
    console.error('[CRON_VERIFY] Fatal error:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
