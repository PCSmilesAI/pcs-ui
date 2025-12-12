import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../../lib/db/client';
import { isValidInvoiceId } from '../../../../../lib/security/type-validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/{id}/reset-allocations
 * 
 * Reset all category allocation amounts to $0 for a given invoice.
 * This is called when the invoice total amount is changed, requiring
 * the user to re-allocate the new amount across categories.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  // SECURITY: Validate invoice ID format
  if (!isValidInvoiceId(invoiceId)) {
    console.warn('[API][RESET_ALLOCATIONS]', 'invalid_invoice_id', { invoiceId, userEmail: user.email });
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const db = getDatabase();

    // Verify invoice exists
    const invoice = db.prepare('SELECT id, invoice_number, amount_cents FROM invoices WHERE id = ? OR invoice_number = ?')
      .get(invoiceId, invoiceId) as any;

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Reset all category amounts to 0 for this invoice
    const result = db.prepare(`
      UPDATE invoice_categories 
      SET amount_cents = 0 
      WHERE invoice_id = ?
    `).run(invoice.id);

    // Log the reset event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, actor_email, payload_json)
      VALUES (?, 'ALLOCATIONS_RESET', ?, ?)
    `).run(
      invoice.id,
      user.email,
      JSON.stringify({
        reason: 'Invoice amount changed',
        categories_reset: result.changes
      })
    );

    // Get the updated categories
    const categories = db.prepare(`
      SELECT id, category_id, category_name, amount_cents, source, created_at
      FROM invoice_categories
      WHERE invoice_id = ?
      ORDER BY created_at ASC
    `).all(invoice.id) as any[];

    console.log('[API][RESET_ALLOCATIONS]', 'success', {
      invoiceId: invoice.id,
      categoriesReset: result.changes,
      userEmail: user.email
    });

    return NextResponse.json({
      ok: true,
      invoice_id: invoice.id,
      invoice_amount_cents: invoice.amount_cents,
      categories_reset: result.changes,
      categories: categories.map(c => ({
        id: c.category_id,
        name: c.category_name,
        amount_cents: c.amount_cents,
        source: c.source
      })),
      message: 'All category allocations have been reset to $0. Please re-allocate the invoice amount.'
    });
  } catch (error: any) {
    console.error('[API][RESET_ALLOCATIONS]', 'error', { invoiceId, error: error?.message });
    return NextResponse.json({ error: 'Failed to reset allocations' }, { status: 500 });
  }
}

/**
 * GET /api/invoices/{id}/reset-allocations
 * 
 * Get current allocation status for an invoice.
 * Returns total amount, allocated amount, and remaining amount.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoiceId = params.id;

  // SECURITY: Validate invoice ID format
  if (!isValidInvoiceId(invoiceId)) {
    console.warn('[API][RESET_ALLOCATIONS][GET]', 'invalid_invoice_id', { invoiceId });
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const db = getDatabase();

    // Get invoice
    const invoice = db.prepare('SELECT id, invoice_number, amount_cents FROM invoices WHERE id = ? OR invoice_number = ?')
      .get(invoiceId, invoiceId) as any;

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get categories with amounts
    const categories = db.prepare(`
      SELECT category_id, category_name, amount_cents, source
      FROM invoice_categories
      WHERE invoice_id = ?
      ORDER BY created_at ASC
    `).all(invoice.id) as any[];

    // Calculate totals
    const totalAmountCents = invoice.amount_cents || 0;
    const allocatedAmountCents = categories.reduce((sum, c) => sum + (c.amount_cents || 0), 0);
    const remainingAmountCents = totalAmountCents - allocatedAmountCents;

    return NextResponse.json({
      ok: true,
      invoice_id: invoice.id,
      total_amount_cents: totalAmountCents,
      allocated_amount_cents: allocatedAmountCents,
      remaining_amount_cents: remainingAmountCents,
      is_fully_allocated: remainingAmountCents === 0 && categories.length > 0,
      categories: categories.map(c => ({
        id: c.category_id,
        name: c.category_name,
        amount_cents: c.amount_cents || 0,
        source: c.source
      }))
    });
  } catch (error: any) {
    console.error('[API][RESET_ALLOCATIONS][GET]', 'error', { invoiceId, error: error?.message });
    return NextResponse.json({ error: 'Failed to get allocation status' }, { status: 500 });
  }
}
