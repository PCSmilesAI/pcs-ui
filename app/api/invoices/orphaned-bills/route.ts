import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/orphaned-bills
 * Returns approved invoices (status = 'to_be_paid') that never received a QBO bill ID,
 * typically because the QBO connection was down when they were approved.
 */
export async function GET(_req: NextRequest) {
  const db = getDatabase();

  const invoices = db.prepare(`
    SELECT id, invoice_number, vendor_name, status, amount_cents,
           office_location, approved_at, created_at
    FROM invoices
    WHERE status = 'to_be_paid'
      AND deleted = 0
      AND (qbo_bill_id IS NULL OR qbo_bill_id = '')
    ORDER BY approved_at DESC
  `).all() as any[];

  return NextResponse.json({
    ok: true,
    count: invoices.length,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      vendor_name: inv.vendor_name,
      amount: inv.amount_cents ? (inv.amount_cents / 100).toFixed(2) : null,
      office_location: inv.office_location,
      approved_at: inv.approved_at,
    })),
  });
}
