import { NextRequest, NextResponse } from 'next/server';
import { getById } from '../../../../lib/workflow/invoiceStore';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;

    // Load the invoice from the workflow store (which has the current status)
    const invoice = await getById(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Ensure invoice has a valid status - default to 'incoming' if missing
    if (!invoice.status) {
      console.log('[API][INVOICES]', 'getById_missing_status', { invoiceId, defaulting: 'incoming' });
      invoice.status = 'incoming';
    }

    return NextResponse.json({
      ok: true,
      invoice
    });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
