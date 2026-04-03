import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { readRoles, getThreshold, isAdmin } from '../../../../lib/workflow/rolesStore';
import { getInvoiceById, saveInvoice, softDeleteInvoice } from '../../../../lib/invoices/db-store';
import { approveAP, approveOffice, approveAdmin, markPaid } from '../../../../lib/workflow/engine';
import { rateLimitByUser } from '../../../../lib/ratelimit/rateLimiter';
import { maybeAddToHistory } from '../../../../lib/gpt/historyAutoAdd';
import { createBillFromInvoice } from '../../../../lib/qbo/billCreationService';

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
    const rejectionReason = body?.rejectionReason as 'duplicate' | 'coding_error' | 'other' | undefined;
    const feedback = body?.feedback || '';

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

        const { getDatabase } = await import('../../../../lib/db/client');
        const db = getDatabase();

        const now = new Date().toISOString();
        const feedbackNote = `[Coding correction needed - ${now}] ${feedback.trim()}`;
        invoice.notes = invoice.notes ? `${invoice.notes}\n\n${feedbackNote}` : feedbackNote;
        invoice.status = 'incoming';
        invoice.current_assigned_user_email = invoice.coded_by_user_id || invoice.verified_by_user_id || null;
        invoice.qbo_bill_id = null;
        invoice.qbo_bill_created_at = null;

        // Clear approval fields
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

        console.log('[API][INVOICES][TRANSITION]', 'return_for_coding_success', { invoiceId: String(invoiceId), userEmail: user.email });
        return NextResponse.json({ ok: true, invoice });
      }

      // Duplicate / Other: soft delete with formatted reason
      const formattedReason = rejectionReason === 'duplicate'
        ? '[Duplicate Invoice]'
        : rejectionReason === 'other'
          ? feedback.trim() ? `[Other] ${feedback.trim()}` : '[Other]'
          : reason || 'No reason provided';
      softDeleteInvoice(String(invoiceId), formattedReason);
      console.log('[API][INVOICES][TRANSITION]', 'reject_success', { invoiceId: String(invoiceId), userEmail: user.email });
      return NextResponse.json({ ok: true });
    }

    // Send back to For Me page (from To Be Paid) - doesn't delete, just changes status
    if (action === 'send_back') {
      invoice.status = 'awaiting_office_approval'; // This will show in "For Me" page
      invoice.notes = reason ? `Sent back: ${reason}` : 'Sent back from To Be Paid for review';
      saveInvoice(invoice);
      console.log('[API][INVOICES][TRANSITION]', 'send_back_success', { invoiceId: String(invoiceId), userEmail: user.email, newStatus: invoice.status });
      return NextResponse.json({ ok: true, invoice });
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

        // Check if user is an admin - admin approval is FINAL and goes directly to to_be_paid
        const isUserAdmin = await isAdmin(user.email);
        
        if (isUserAdmin) {
          // Admin approval bypasses all intermediate steps and goes directly to to_be_paid
          console.log('[API][INVOICES][TRANSITION]', 'admin_direct_approval', { invoiceId: String(invoiceId), userEmail: user.email, previousStatus: status });
          approveAdmin(invoice, { email: user.email, name: user.name });
        } else if (status === 'incoming' || status === 'categorized' || status === 'pending') {
          approveAP(invoice, { email: user.email, name: user.name }, roles);
        } else if (status === 'awaiting_office_approval') {
          approveOffice(invoice, { email: user.email, name: user.name }, threshold);
        } else if (status === 'awaiting_admin_approval') {
          // This branch is now only for non-admins, which shouldn't happen
          console.log('[API][INVOICES][TRANSITION]', 'admin_approval_unauthorized', { invoiceId: String(invoiceId), userEmail: user.email });
          return NextResponse.json({ error: 'Only admins can approve invoices at this stage' }, { status: 403 });
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
      
      // If transitioning to to_be_paid, create QBO bill FIRST
      let qboBillResult: { success: boolean; billId?: string; error?: string } | null = null;
      if (invoice.status === 'to_be_paid') {
        console.log('[API][INVOICES][TRANSITION]', 'creating_qbo_bill', { invoiceId: String(invoiceId) });
        try {
          qboBillResult = await createBillFromInvoice({
            invoiceData: invoice,
            invoiceId: String(invoiceId),
          });
          
          if (qboBillResult.success && qboBillResult.billId) {
            // Save QBO bill ID to the invoice
            invoice.qbo_bill_id = qboBillResult.billId;
            invoice.qbo_bill_created_at = new Date().toISOString();
            console.log('[API][INVOICES][TRANSITION]', 'qbo_bill_created', { 
              invoiceId: String(invoiceId), 
              qboBillId: qboBillResult.billId 
            });
          } else {
            console.warn('[API][INVOICES][TRANSITION]', 'qbo_bill_failed', { 
              invoiceId: String(invoiceId), 
              error: qboBillResult?.error 
            });
            // Don't block approval if QBO bill creation fails, but log it
          }
        } catch (qboErr: any) {
          console.error('[API][INVOICES][TRANSITION]', 'qbo_bill_error', { 
            invoiceId: String(invoiceId), 
            error: String(qboErr) 
          });
          // Don't block approval, but log the error
        }
      }
      
      try {
        saveInvoice(invoice);
        console.log('[API][INVOICES][TRANSITION]', 'approve_success', { invoiceId: String(invoiceId), userEmail: user.email });
        
        // Auto-add to vendor history for AI training (async, don't block response)
        if (invoice.status === 'to_be_paid') {
          maybeAddToHistory(invoice).then(result => {
            if (result.added) {
              console.log('[API][INVOICES][TRANSITION]', 'added_to_history', { invoiceId: String(invoiceId) });
            }
          }).catch(err => {
            console.warn('[API][INVOICES][TRANSITION]', 'history_add_failed', { invoiceId: String(invoiceId), error: String(err) });
          });
        }
      } catch (err: any) {
        // Log full error server-side only
        console.error('[API][INVOICES][TRANSITION]', 'save_error', { invoiceId: String(invoiceId), error: String(err) });
        // Return safe error message to client
        return NextResponse.json({ error: 'Failed to save invoice' }, { status: 500 });
      }
      
      return NextResponse.json({ 
        ok: true, 
        invoice,
        qboBill: qboBillResult ? {
          created: qboBillResult.success,
          billId: qboBillResult.billId,
          error: qboBillResult.error,
        } : null
      });
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
        
        // Auto-add to vendor history for AI training (async, don't block response)
        maybeAddToHistory(invoice).then(result => {
          if (result.added) {
            console.log('[API][INVOICES][TRANSITION]', 'added_to_history_paid', { invoiceId: String(invoiceId) });
          }
        }).catch(err => {
          console.warn('[API][INVOICES][TRANSITION]', 'history_add_failed', { invoiceId: String(invoiceId), error: String(err) });
        });
        
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
