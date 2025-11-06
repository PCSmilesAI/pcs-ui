import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { readRoles, getThreshold, isAdmin } from '../../../../lib/workflow/rolesStore';
import { getInvoiceById, saveInvoice, softDeleteInvoice } from '../../../../lib/invoices/db-store';
import { approveAP, approveOffice, approveAdmin, markPaid } from '../../../../lib/workflow/engine';

export const dynamic = 'force-dynamic';

/**
 * Database-backed invoice transition endpoint.
 * This is the new version that reads/writes from SQLite.
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  try {
    const body = await req.json();
    const invoiceId = body?.id || body?.invoiceId;
    const action = body?.action;
    const reason = body?.reason || body?.notes || '';

    if (!invoiceId || typeof action !== 'string') {
      console.log('[API][INVOICES][DB]', 'transition_invalid_payload', { userEmail: user.email });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Read from database
    const invoice = getInvoiceById(String(invoiceId));
    if (!invoice) {
      console.log('[API][INVOICES][DB]', 'transition_not_found', { invoiceId: String(invoiceId), userEmail: user.email });
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const roles = await readRoles();
    const threshold = await getThreshold();
    console.log('[API][INVOICES][DB]', `transition_request_${action}`, { invoiceId: String(invoiceId), userEmail: user.email });

    if (action === 'reject') {
      softDeleteInvoice(String(invoiceId), reason);
      console.log('[API][INVOICES][DB]', 'transition_reject', { invoiceId: String(invoiceId), userEmail: user.email });
      return NextResponse.json({ ok: true });
    }

    if (action === 'approve') {
      console.log('[API][INVOICES][DB]', 'transition_approve_received', { invoiceId: String(invoiceId), userEmail: user.email, invoiceStatus: invoice.status });
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
            console.log('[API][INVOICES][DB]', 'transition_admin_approval_unauthorized', { invoiceId: String(invoiceId), userEmail: user.email });
            return NextResponse.json({ error: 'Only admins can approve invoices at this stage' }, { status: 403 });
          }
          approveAdmin(invoice, { email: user.email, name: user.name });
        } else {
          return NextResponse.json({ error: `Nothing to approve. Invoice status is '${status}' but must be one of: incoming, categorized, pending, awaiting_office_approval, awaiting_admin_approval` }, { status: 400 });
        }
      } catch (err: any) {
        console.error('[WORKFLOW][ENGINE]', 'error', { invoiceId: String(invoiceId), message: err?.message });
        return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 400 });
      }

      console.log('[API][INVOICES][DB]', 'transition_before_save', { invoiceId: String(invoiceId), status: invoice.status });
      try {
        saveInvoice(invoice);
        console.log('[API][INVOICES][DB]', 'transition_approve_success', { invoiceId: String(invoiceId), userEmail: user.email });
      } catch (err: any) {
        console.error('[API][INVOICES][DB]', 'transition_save_error', { invoiceId: String(invoiceId), error: String(err) });
        return NextResponse.json({ error: 'Failed to save invoice: ' + err?.message }, { status: 500 });
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
      } catch (err: any) {
        console.error('[WORKFLOW][ENGINE]', 'mark_paid_error', { invoiceId: String(invoiceId), message: err?.message });
        return NextResponse.json({ error: err?.message || 'Mark paid failed' }, { status: 400 });
      }

      saveInvoice(invoice);
      console.log('[API][INVOICES][DB]', 'transition_mark_paid_success', { invoiceId: String(invoiceId), userEmail: user.email });
      return NextResponse.json({ ok: true, invoice });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[API][INVOICES][DB]', 'transition_error', { userEmail: user.email, message: error?.message });
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}

