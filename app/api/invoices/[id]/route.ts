import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    const db = getDatabase();

    // Load the invoice from the database - support both id and invoice_number lookups
    const invoice = db.prepare(
      'SELECT * FROM invoices WHERE (id = ? OR invoice_number = ?) AND deleted = 0'
    ).get(invoiceId, invoiceId) as any;

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Parse JSON fields
    const parsed = {
      ...invoice,
      field_locks: invoice.field_locks ? JSON.parse(invoice.field_locks) : {},
      approvals: invoice.approvals ? JSON.parse(invoice.approvals) : {},
    };

    // Ensure invoice has a valid status - default to 'incoming' if missing
    if (!parsed.status) {
      console.log('[API][INVOICES]', 'getById_missing_status', { invoiceId, defaulting: 'incoming' });
      parsed.status = 'incoming';
    }

    return NextResponse.json({
      ok: true,
      invoice: parsed
    });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
