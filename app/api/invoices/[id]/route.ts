import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { isValidInvoiceId } from '../../../../lib/security/type-validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;

    // SECURITY: Validate invoice ID format
    if (!isValidInvoiceId(invoiceId)) {
      console.warn('[API][INVOICES][GET]', 'invalid_invoice_id', { invoiceId });
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }
    const db = getDatabase();

    // Load the invoice from the database - support both id and invoice_number lookups
    const invoice = db.prepare(
      'SELECT * FROM invoices WHERE (id = ? OR invoice_number = ?) AND deleted = 0'
    ).get(invoiceId, invoiceId) as any;

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Parse JSON fields
    const parsed = {
      ...invoice,
      field_locks: invoice.field_locks ? JSON.parse(invoice.field_locks) : {},
      approvals: invoice.approvals ? JSON.parse(invoice.approvals) : {},
    };

    // Ensure invoice has a valid status - default to 'incoming' if missing
    if (!parsed.status) {
      console.log('[API][INVOICES]', 'getById_missing_status', { invoiceId, defaulting: 'incoming' });
      parsed.status = 'incoming';
    }

    // Fetch allocations if invoice is multi-location
    let allocations: any[] = [];
    if (invoice.is_multi_location || invoice.coding_template_id) {
      allocations = db.prepare(`
        SELECT 
          ia.*,
          c.name as clinic_name,
          c.id as clinic_id
        FROM invoice_allocations ia
        LEFT JOIN clinics c ON ia.clinic_id = c.id
        WHERE ia.invoice_id = ?
        ORDER BY ia.created_at
      `).all(invoice.id || invoiceId) as any[];
    }

    // Fetch template info if exists
    let template: any = null;
    if (invoice.coding_template_id) {
      template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(invoice.coding_template_id) as any;
    }

    return NextResponse.json({
      ok: true,
      invoice: parsed,
      allocations: allocations,
      template: template
    });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
