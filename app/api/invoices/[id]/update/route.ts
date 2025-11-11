import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../../lib/db/client';
import { applyCorrections } from '../../../../../lib/invoices/write';
import { logRepair } from '../../../../../lib/invoices/repairLogging';
import { rateLimitByUser } from '../../../../../lib/ratelimit/rateLimiter';
import { isValidInvoiceId } from '../../../../../lib/security/type-validation';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  // SECURITY: Validate invoice ID format
  if (!isValidInvoiceId(invoiceId)) {
    console.warn('[API][INVOICES][UPDATE]', 'invalid_invoice_id', { invoiceId, userEmail: user.email });
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  // Apply rate limiting per user (500 update requests per minute)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 500, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][INVOICES][UPDATE]', 'rate_limit_exceeded', { userEmail: user.email, invoiceId });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '500',
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  }

  try {
    const db = getDatabase();
    
    // Fetch the original invoice before any changes
    const originalInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!originalInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

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

    // Apply corrections to database
    await applyCorrections(invoiceId, user.email, patch, overrideLocks === true);

    // Fetch updated invoice
    const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!updatedInvoice) {
      return NextResponse.json({ error: 'Invoice not found after update' }, { status: 404 });
    }

    // Log the repair for AI training
    try {
      await logRepair(
        originalInvoice.invoice_number,
        originalInvoice.vendor_name || originalInvoice.parsed_vendor_name || 'Unknown',
        user.email,
        {
          invoice_number: originalInvoice.invoice_number,
          vendor_name: originalInvoice.vendor_name,
          office_id: originalInvoice.office_id,
          amount_cents: originalInvoice.amount_cents,
          parsed_vendor_name: originalInvoice.parsed_vendor_name,
          parsed_office_id: originalInvoice.parsed_office_id,
          parsed_amount_cents: originalInvoice.parsed_amount_cents,
        },
        {
          invoice_number: updatedInvoice.invoice_number,
          vendor_name: updatedInvoice.vendor_name,
          office_id: updatedInvoice.office_id,
          amount_cents: updatedInvoice.amount_cents,
          parsed_vendor_name: updatedInvoice.parsed_vendor_name,
          parsed_office_id: updatedInvoice.parsed_office_id,
          parsed_amount_cents: updatedInvoice.parsed_amount_cents,
        },
        originalInvoice.pdf_path
      );
    } catch (logError) {
      console.error('[API][INVOICES][UPDATE]', 'Failed to log repair', { invoiceId, error: (logError as any)?.message });
      // Don't fail the update if logging fails, just log the error
    }

    console.log('[API][INVOICES][UPDATE]', 'success', { invoiceId, userEmail: user.email });
    return NextResponse.json({ ok: true, invoice: updatedInvoice });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[API][INVOICES][UPDATE]', 'error', { invoiceId, error: err?.message });

    if (err?.message?.includes('locked')) {
      // Return safe error message to client
      return NextResponse.json({ error: 'Invoice is locked' }, { status: 409 });
    }

    // Return safe error message to client
    return NextResponse.json({ error: 'Update failed' }, { status: 400 });
  }
}

