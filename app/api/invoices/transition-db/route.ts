import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { readRoles, getThreshold, isAdmin } from '../../../../lib/workflow/rolesStore';
import { getInvoiceById, saveInvoice, softDeleteInvoice } from '../../../../lib/invoices/db-store';
import { approveAP, approveOffice, approveAdmin, markPaid } from '../../../../lib/workflow/engine';
import { maybeAddToHistory } from '../../../../lib/gpt/historyAutoAdd';
import { getDatabase } from '../../../../lib/db/client';

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
    const rejectionReason = body?.rejectionReason as 'duplicate' | 'coding_error' | 'other' | undefined;
    const feedback = body?.feedback || '';

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
      // Coding Error: return invoice to coder with feedback (do not delete)
      if (rejectionReason === 'coding_error') {
        const status = (invoice.status || '').toLowerCase();
        const allowedStatuses = ['awaiting_admin_approval', 'awaiting_office_approval', 'categorized'];
        if (!allowedStatuses.includes(status)) {
          return NextResponse.json(
            { error: `Invoice status (${status}) does not allow return for coding corrections` },
            { status: 400 }
          );
        }
        if (!feedback.trim()) {
          return NextResponse.json({ error: 'Feedback is required for coding error returns' }, { status: 400 });
        }

        const db = getDatabase();
        const now = new Date().toISOString();
        const feedbackNote = `[Coding correction needed - ${now}] ${feedback.trim()}`;
        invoice.notes = invoice.notes ? `${invoice.notes}\n\n${feedbackNote}` : feedbackNote;
        invoice.status = 'incoming';
        invoice.current_assigned_user_email = invoice.coded_by_user_id || invoice.verified_by_user_id || null;
        invoice.qbo_bill_id = null;
        invoice.qbo_bill_created_at = null;

        if (invoice.approvals && typeof invoice.approvals === 'object') {
          delete invoice.approvals.office;
          delete invoice.approvals.admin;
        }
        invoice.om_approved_at = null;
        invoice.om_approved_by = null;
        invoice.admin_approved_at = null;
        invoice.admin_approved_by = null;
        invoice.approved_at = null;
        invoice.approved_by_user_id = null;
        invoice.approval_stage = null;

        saveInvoice(invoice);

        db.prepare(`
          INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          String(invoiceId),
          'RETURNED_FOR_CODING',
          user.email,
          JSON.stringify({ feedback: feedback.trim(), rejectionReason: 'coding_error', actor: user.email })
        );

        console.log('[API][INVOICES][DB]', 'return_for_coding_success', { invoiceId: String(invoiceId), userEmail: user.email });
        return NextResponse.json({ ok: true, invoice });
      }

      // Duplicate / Other: soft delete with formatted reason
      const formattedReason = rejectionReason === 'duplicate'
        ? '[Duplicate Invoice]'
        : rejectionReason === 'other'
          ? feedback.trim() ? `[Other] ${feedback.trim()}` : '[Other]'
          : reason || 'No reason provided';
      softDeleteInvoice(String(invoiceId), formattedReason);
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
          return NextResponse.json({ error: 'Invoice status does not allow approval at this time' }, { status: 400 });
        }
      } catch (err: any) {
        // Log full error server-side only
        console.error('[WORKFLOW][ENGINE]', 'error', { invoiceId: String(invoiceId), message: err?.message });
        // Return safe error message to client
        return NextResponse.json({ error: 'Approval failed' }, { status: 400 });
      }

      console.log('[API][INVOICES][DB]', 'transition_before_save', { invoiceId: String(invoiceId), status: invoice.status });
      try {
        saveInvoice(invoice);
        console.log('[API][INVOICES][DB]', 'transition_approve_success', { invoiceId: String(invoiceId), userEmail: user.email });
        
        // Auto-add to vendor history for AI training (async, don't block response)
        if (invoice.status === 'to_be_paid') {
          maybeAddToHistory(invoice).then(result => {
            if (result.added) {
              console.log('[API][INVOICES][DB]', 'added_to_history', { invoiceId: String(invoiceId) });
            }
          }).catch(err => {
            console.warn('[API][INVOICES][DB]', 'history_add_failed', { invoiceId: String(invoiceId), error: String(err) });
          });
        }
      } catch (err: any) {
        // Log full error server-side only
        console.error('[API][INVOICES][DB]', 'transition_save_error', { invoiceId: String(invoiceId), error: String(err) });
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
      } catch (err: any) {
        // Log full error server-side only
        console.error('[WORKFLOW][ENGINE]', 'mark_paid_error', { invoiceId: String(invoiceId), message: err?.message });
        // Return safe error message to client
        return NextResponse.json({ error: 'Failed to mark as paid' }, { status: 400 });
      }

      saveInvoice(invoice);
      console.log('[API][INVOICES][DB]', 'transition_mark_paid_success', { invoiceId: String(invoiceId), userEmail: user.email });
      
      // Auto-add to vendor history for AI training (async, don't block response)
      maybeAddToHistory(invoice).then(result => {
        if (result.added) {
          console.log('[API][INVOICES][DB]', 'added_to_history_paid', { invoiceId: String(invoiceId) });
        }
      }).catch(err => {
        console.warn('[API][INVOICES][DB]', 'history_add_failed', { invoiceId: String(invoiceId), error: String(err) });
      });
      
      return NextResponse.json({ ok: true, invoice });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    // Log full error server-side only
    console.error('[API][INVOICES][DB]', 'transition_error', { userEmail: user.email, message: error?.message });
    // Return safe error message to client
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

