import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { readRoles, getThreshold, isAdmin } from '../../../../lib/workflow/rolesStore';
import { getInvoiceById, saveInvoice, softDeleteInvoice } from '../../../../lib/invoices/db-store';
import { approveAP, approveOffice, approveAdmin, markPaid } from '../../../../lib/workflow/engine';
import { rateLimitByUser } from '../../../../lib/ratelimit/rateLimiter';

export const dynamic = 'force-dynamic';

/**
 * This endpoint handles invoice transitions (approve, reject, mark_paid).
 * It directly implements the logic instead of delegating via fetch to avoid SSL issues.
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  // Apply rate limiting per user (1000 requests per minute)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 1000, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][INVOICES][TRANSITION]', 'rate_limit_exceeded', { userEmail: user.email });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '1000',
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const invoiceId = body?.id || body?.invoiceId;
    const action = body?.action;
    const reason = body?.reason || body?.notes || '';

    if (!invoiceId || typeof action !== 'string') {
      console.log('[API][INVOICES][TRANSITION]', 'invalid_payload', { userEmail: user.email });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Read from database
    const invoice = getInvoiceById(String(invoiceId));
    if (!invoice) {
      console.log('[API][INVOICES][TRANSITION]', 'not_found', { invoiceId: String(invoiceId), userEmail: user.email });
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Load GL Line locations (class names from invoice_categories)
    try {
      const { getDatabase } = await import('../../../../lib/db/client');
      const db = getDatabase();
      const glLines = db.prepare(`
        SELECT DISTINCT class_name FROM invoice_categories 
        WHERE invoice_id = ? AND class_name IS NOT NULL AND class_name != ''
      `).all(invoice.id) as Array<{ class_name: string }>;
      
      if (glLines.length > 0) {
        invoice.locations = glLines.map(gl => gl.class_name);
        console.log('[API][INVOICES][TRANSITION]', 'gl_locations_loaded', { invoiceId: String(invoiceId), locations: invoice.locations });
      }
    } catch (err) {
      console.warn('[API][INVOICES][TRANSITION]', 'gl_locations_load_error', { invoiceId: String(invoiceId), error: String(err) });
    }

    const roles = await readRoles();
    const threshold = await getThreshold();
    console.log('[API][INVOICES][TRANSITION]', `transition_request_${action}`, { invoiceId: String(invoiceId), userEmail: user.email });

    if (action === 'reject') {
      softDeleteInvoice(String(invoiceId), reason);
      console.log('[API][INVOICES][TRANSITION]', 'reject_success', { invoiceId: String(invoiceId), userEmail: user.email });
      return NextResponse.json({ ok: true });
    }

    if (action === 'approve') {
      console.log('[API][INVOICES][TRANSITION]', 'approve_received', { invoiceId: String(invoiceId), userEmail: user.email, invoiceStatus: invoice.status });
      try {
        // Ensure invoice has a valid status
        if (!invoice.status) {
          invoice.status = 'incoming';
        }

        const status = (invoice.status || 'incoming').toLowerCase();

        // Ensure office field is populated from request body if provided
        if (body?.office) {
          invoice.office_id = body.office;
        }

        if (status === 'incoming' || status === 'categorized' || status === 'pending') {
          approveAP(invoice, { email: user.email, name: user.name }, roles);
        } else if (status === 'awaiting_office_approval') {
          approveOffice(invoice, { email: user.email, name: user.name }, threshold);
        } else if (status === 'awaiting_admin_approval') {
          // Only admins can approve invoices in awaiting_admin_approval status
          const isUserAdmin = await isAdmin(user.email);
          if (!isUserAdmin) {
            console.log('[API][INVOICES][TRANSITION]', 'admin_approval_unauthorized', { invoiceId: String(invoiceId), userEmail: user.email });
            return NextResponse.json({ error: 'Only admins can approve invoices at this stage' }, { status: 403 });
          }
          approveAdmin(invoice, { email: user.email, name: user.name });
        } else {
          return NextResponse.json({ error: 'Invoice status does not allow approval at this time' }, { status: 400 });
        }
      } catch (err: any) {
        // Log full error server-side only
        console.error('[WORKFLOW][ENGINE]', 'error', { invoiceId: String(invoiceId), message: err?.message });
        // Return safe error message to client
        return NextResponse.json({ error: 'Approval failed' }, { status: 400 });
      }

      console.log('[API][INVOICES][TRANSITION]', 'before_save', { invoiceId: String(invoiceId), status: invoice.status });
      try {
        saveInvoice(invoice);
        console.log('[API][INVOICES][TRANSITION]', 'approve_success', { invoiceId: String(invoiceId), userEmail: user.email });
      } catch (err: any) {
        // Log full error server-side only
        console.error('[API][INVOICES][TRANSITION]', 'save_error', { invoiceId: String(invoiceId), error: String(err) });
        // Return safe error message to client
        return NextResponse.json({ error: 'Failed to save invoice' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, invoice });
    }

    if (action === 'mark_paid') {
      // Only admins can mark invoices as paid
      const allowed = await isAdmin(user.email);
      if (!allowed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      try {
        const total = body?.total ?? body?.amount;
        const stripePaymentId = body?.stripePaymentId || body?.stripe_id || undefined;
        markPaid(invoice, { email: user.email, total, stripePaymentId });
        saveInvoice(invoice);
        console.log('[API][INVOICES][TRANSITION]', 'mark_paid_success', { invoiceId: String(invoiceId), userEmail: user.email });
        return NextResponse.json({ ok: true, invoice });
      } catch (err: any) {
        // Log full error server-side only
        console.error('[API][INVOICES][TRANSITION]', 'mark_paid_error', { invoiceId: String(invoiceId), error: String(err) });
        // Return safe error message to client
        return NextResponse.json({ error: 'Failed to mark as paid' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[API][INVOICES][TRANSITION]', 'unexpected_error', { error: String(err) });
    // Return safe error message to client
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
