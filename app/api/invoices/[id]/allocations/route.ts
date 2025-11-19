import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../../lib/db/client';
import { getInvoiceAllocations, getAllClinics } from '../../../../../lib/invoices/coding-template-service';
import { getAllocationSummary, validateAllocations } from '../../../../../lib/qbo/multi-location-bill-builder';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/{id}/allocations
 * 
 * Get allocations for a multi-location invoice.
 * Returns allocation details with clinic information.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  try {
    const db = getDatabase();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Get allocations
    const allocations = getInvoiceAllocations(invoiceId);
    const summary = getAllocationSummary(invoiceId);
    const validation = validateAllocations(invoiceId);

    return NextResponse.json({
      ok: true,
      invoice_id: invoiceId,
      is_multi_location: invoice.is_multi_location,
      allocations,
      summary,
      validation
    });
  } catch (error: any) {
    console.error('[API][ALLOCATIONS]', 'GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

