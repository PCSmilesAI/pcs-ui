import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/workflow/auth';
import { isAPManager } from '@/lib/workflow/rolesStore';
import { applyCodingTemplate } from '@/lib/invoices/coding-template-service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create a new invoice from a coding template
 * POST /api/invoices/create-from-template
 * 
 * Body:
 * {
 *   template_id: string,
 *   invoice_number: string,
 *   vendor_name: string,
 *   amount_cents: number,
 *   invoice_date: string (ISO),
 *   due_date?: string (ISO),
 *   description?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    const db = getDatabase();

    // Check authorization - only AP Managers can create invoices
    const isManager = await isAPManager(user.email);
    if (!isManager) {
      return NextResponse.json(
        { error: 'Only AP Managers can create invoices' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      template_id,
      invoice_number,
      vendor_name,
      amount_cents,
      invoice_date,
      due_date,
      description,
    } = body;

    // Validate required fields
    if (!template_id || !invoice_number || !vendor_name || !amount_cents) {
      return NextResponse.json(
        { error: 'Missing required fields: template_id, invoice_number, vendor_name, amount_cents' },
        { status: 400 }
      );
    }

    // Verify template exists
    const template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(template_id) as any;
    if (!template) {
      return NextResponse.json(
        { error: 'Coding template not found' },
        { status: 404 }
      );
    }

    // Check if invoice number already exists
    const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoice_number) as any;
    if (existing) {
      return NextResponse.json(
        { error: 'Invoice number already exists' },
        { status: 409 }
      );
    }

    // Create new invoice
    const invoiceId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO invoices (
        id,
        invoice_number,
        vendor_name,
        amount_cents,
        invoice_date,
        due_date,
        description,
        status,
        approvals,
        deleted,
        created_at,
        updated_at,
        is_multi_location,
        coding_template_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId,
      invoice_number,
      vendor_name,
      amount_cents,
      invoice_date,
      due_date || null,
      description || '',
      'coded',  // Start with 'coded' status since template is applied
      JSON.stringify({}),
      0,
      now,
      now,
      1,  // is_multi_location = true
      template_id
    );

    // Apply the coding template to generate allocations
    const result = applyCodingTemplate(invoiceId, template_id, user.email);

    if (!result.success) {
      // Rollback invoice creation
      db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
      return NextResponse.json(
        { error: result.error || 'Failed to apply coding template' },
        { status: 400 }
      );
    }

    // Fetch the created invoice with allocations
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    const allocations = db.prepare('SELECT * FROM invoice_allocations WHERE invoice_id = ?').all(invoiceId) as any[];

    console.log('[API][CREATE_FROM_TEMPLATE]', 'invoice_created', {
      invoiceId,
      invoiceNumber: invoice_number,
      templateId: template_id,
      userEmail: user.email,
      numAllocations: allocations.length,
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        vendor_name: invoice.vendor_name,
        amount_cents: invoice.amount_cents,
        status: invoice.status,
        is_multi_location: invoice.is_multi_location,
      },
      allocations: allocations.map((a: any) => ({
        id: a.id,
        clinic_id: a.clinic_id,
        amount_cents: a.amount_cents,
        gl_account_name: a.gl_account_name,
      })),
    });
  } catch (error: any) {
    console.error('[API][CREATE_FROM_TEMPLATE]', 'error', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

