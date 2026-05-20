import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../lib/db/client';
import { getCurrentUser } from '../../../../../lib/auth/currentUser';
import { normalizeVendorNameForStorage } from '../../../../../lib/invoices/vendorNormalization';

export const dynamic = 'force-dynamic';

interface RouteIncomingPayload {
  vendor_name?: string;
  amount_cents?: number;
  invoice_number?: string;
  office_location?: string;
}

/**
 * POST /api/invoices/[id]/route-incoming
 *
 * Fix fields on an incoming invoice and push it into the normal workflow.
 * - Updates vendor, amount, invoice_number, office_location if provided
 * - Transitions status from 'incoming' to 'categorized'
 * - Triggers auto-categorization
 * - Logs an audit event
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = getCurrentUser(req);
  const invoiceId = params.id;

  try {
    const body = (await req.json()) as RouteIncomingPayload;
    const db = getDatabase();

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(invoiceId, invoiceId) as any;
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status !== 'incoming') {
      return NextResponse.json(
        { error: `Invoice is already in '${invoice.status}' status, not incoming` },
        { status: 400 }
      );
    }

    const vendorName = body.vendor_name
      ? normalizeVendorNameForStorage(body.vendor_name)
      : invoice.vendor_name;
    const amountCents = body.amount_cents ?? invoice.amount_cents;
    const invoiceNumber = body.invoice_number || invoice.invoice_number;
    const officeLocation = body.office_location ?? invoice.office_location;

    db.prepare(`
      UPDATE invoices SET
        vendor_name = ?,
        parsed_vendor_name = COALESCE(parsed_vendor_name, ?),
        amount_cents = ?,
        parsed_amount_cents = COALESCE(parsed_amount_cents, ?),
        invoice_number = ?,
        office_location = ?,
        office_id = ?,
        status = 'categorized',
        parsing_status = CASE WHEN parsing_status IN ('failed','partial') THEN 'success' ELSE parsing_status END,
        parsing_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      vendorName, vendorName,
      amountCents, amountCents,
      invoiceNumber,
      officeLocation, officeLocation,
      invoice.id
    );

    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, actor_email, actor_name, payload_json)
      VALUES (?, 'ROUTED_FROM_INCOMING', ?, ?, ?)
    `).run(
      invoice.id,
      user.email || '',
      user.name || '',
      JSON.stringify({
        previous_vendor: invoice.vendor_name,
        new_vendor: vendorName,
        previous_amount: invoice.amount_cents,
        new_amount: amountCents,
        previous_status: 'incoming',
        new_status: 'categorized',
      })
    );

    // Auto-categorize
    try {
      const { categorizeInvoice, storeInvoiceCategories, mapLocationToClass } =
        await import('@/lib/invoices/categoryParser');

      const categories = await categorizeInvoice(
        { vendor_name: vendorName, line_items: [] },
        vendorName
      );

      const classFromLocation = mapLocationToClass(officeLocation || '');
      if (classFromLocation) {
        for (const cat of categories) {
          if (!cat.className) {
            cat.className = classFromLocation;
            cat.classId = classFromLocation;
          }
        }
      }

      await storeInvoiceCategories(invoice.id, categories);
      console.log('[ROUTE_INCOMING] Auto-categorized:', {
        invoiceId: invoice.id,
        categories: categories.map((c: any) => c.categoryName),
      });
    } catch (catErr: any) {
      console.warn('[ROUTE_INCOMING] Auto-categorization failed:', catErr?.message);
    }

    console.log('[ROUTE_INCOMING] Invoice routed:', {
      id: invoice.id,
      invoice_number: invoiceNumber,
      vendor: vendorName,
      by: user.email,
    });

    return NextResponse.json({
      ok: true,
      message: 'Invoice fixed and routed into workflow',
      id: invoice.id,
      invoice_number: invoiceNumber,
      vendor_name: vendorName,
      status: 'categorized',
    });
  } catch (err: any) {
    console.error('[ROUTE_INCOMING] Error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Failed to route invoice' }, { status: 500 });
  }
}
