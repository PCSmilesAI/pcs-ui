import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../../lib/db/client';
import { rateLimitByUser } from '../../../../../lib/ratelimit/rateLimiter';
import { isValidInvoiceId } from '../../../../../lib/security/type-validation';

export const dynamic = 'force-dynamic';

/**
 * Save QBO Bill ID to an invoice after successful bill creation
 * POST /api/invoices/[id]/qbo-bill
 * Body: { billId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  // SECURITY: Validate invoice ID format
  if (!isValidInvoiceId(invoiceId)) {
    console.warn('[API][QBO-BILL]', 'invalid_invoice_id', { invoiceId, userEmail: user.email });
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  // Apply rate limiting
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 100, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][QBO-BILL]', 'rate_limit_exceeded', { userEmail: user.email, invoiceId });
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { billId } = body;

    if (!billId || typeof billId !== 'string') {
      return NextResponse.json({ error: 'billId is required and must be a string' }, { status: 400 });
    }

    const db = getDatabase();

    // Find the invoice (by id or invoice_number)
    let invoice = db.prepare('SELECT id, invoice_number FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      invoice = db.prepare('SELECT id, invoice_number FROM invoices WHERE invoice_number = ?').get(invoiceId) as any;
    }
    if (!invoice) {
      console.warn('[API][QBO-BILL]', 'invoice_not_found', { invoiceId, userEmail: user.email });
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const actualInvoiceId = invoice.id;

    // Update the invoice with the QBO bill ID
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE invoices 
      SET qbo_bill_id = ?, qbo_bill_created_at = ?, updated_at = ?
      WHERE id = ?
    `).run(billId, now, now, actualInvoiceId);

    if (result.changes === 0) {
      console.warn('[API][QBO-BILL]', 'update_failed', { invoiceId: actualInvoiceId, userEmail: user.email });
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    // Log the event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
      VALUES (?, 'QBO_BILL_CREATED', ?, ?)
    `).run(
      actualInvoiceId,
      user.email,
      JSON.stringify({ qbo_bill_id: billId, created_at: now })
    );

    console.log('[API][QBO-BILL]', 'success', { 
      invoiceId: actualInvoiceId, 
      invoiceNumber: invoice.invoice_number,
      qboBillId: billId, 
      userEmail: user.email 
    });

    return NextResponse.json({ 
      ok: true, 
      invoiceId: actualInvoiceId,
      qboBillId: billId 
    });
  } catch (err: any) {
    console.error('[API][QBO-BILL]', 'error', { invoiceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to save QBO bill ID' }, { status: 500 });
  }
}

/**
 * Get QBO Bill ID for an invoice
 * GET /api/invoices/[id]/qbo-bill
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoiceId = params.id;

  // SECURITY: Validate invoice ID format
  if (!isValidInvoiceId(invoiceId)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const db = getDatabase();

    // Find the invoice
    let invoice = db.prepare('SELECT id, invoice_number, qbo_bill_id, qbo_bill_created_at FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      invoice = db.prepare('SELECT id, invoice_number, qbo_bill_id, qbo_bill_created_at FROM invoices WHERE invoice_number = ?').get(invoiceId) as any;
    }
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      ok: true, 
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      qboBillId: invoice.qbo_bill_id || null,
      qboBillCreatedAt: invoice.qbo_bill_created_at || null
    });
  } catch (err: any) {
    console.error('[API][QBO-BILL]', 'get_error', { invoiceId, error: err?.message });
    return NextResponse.json({ error: 'Failed to get QBO bill info' }, { status: 500 });
  }
}

