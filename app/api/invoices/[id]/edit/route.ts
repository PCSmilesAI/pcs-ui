import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../../lib/db/client';
import { applyCorrections } from '../../../../../lib/invoices/write';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  try {
    const body = await req.json();
    const { vendor_name, office_id, amount_cents, overrideLocks } = body;

    // Validate types
    if (vendor_name !== undefined && typeof vendor_name !== 'string') {
      return NextResponse.json({ error: 'vendor_name must be a string' }, { status: 400 });
    }
    if (office_id !== undefined && typeof office_id !== 'string') {
      return NextResponse.json({ error: 'office_id must be a string' }, { status: 400 });
    }
    if (amount_cents !== undefined && typeof amount_cents !== 'number') {
      return NextResponse.json({ error: 'amount_cents must be a number' }, { status: 400 });
    }

    // Build patch
    const patch: Record<string, any> = {};
    if (vendor_name !== undefined) patch.vendor_name = vendor_name;
    if (office_id !== undefined) patch.office_id = office_id;
    if (amount_cents !== undefined) patch.amount_cents = amount_cents;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Apply corrections
    await applyCorrections(invoiceId, user.email, patch, overrideLocks === true);

    // Fetch updated invoice
    const db = getDatabase();
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found after update' }, { status: 404 });
    }

    console.log('[API][INVOICES][EDIT]', 'success', { invoiceId, userEmail: user.email });
    return NextResponse.json({ ok: true, invoice });
  } catch (err: any) {
    console.error('[API][INVOICES][EDIT]', 'error', { invoiceId, error: err?.message });
    
    if (err?.message?.includes('locked')) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    
    return NextResponse.json({ error: err?.message || 'Edit failed' }, { status: 400 });
  }
}

