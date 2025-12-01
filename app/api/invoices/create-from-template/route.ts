import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAP } from '@/lib/workflow/rolesStore';
import { applyCodingTemplate } from '@/lib/invoices/coding-template-service';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

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
    const isManager = await isAP(user.email);
    if (!isManager) {
      return NextResponse.json(
        { error: 'Only AP Managers can create invoices' },
        { status: 403 }
      );
    }

    // Parse FormData to handle both JSON and file uploads
    const formData = await req.formData();
    const template_type = (formData.get('template_type') as string) || 'even_split';
    const template_id = formData.get('template_id') as string;
    const invoice_number = formData.get('invoice_number') as string;
    const vendor_name = formData.get('vendor_name') as string;
    const amount_cents = parseInt(formData.get('amount_cents') as string, 10);
    const invoice_date = formData.get('invoice_date') as string;
    const due_date = formData.get('due_date') as string;
    const description = formData.get('description') as string;
    const pdfFileInput = formData.get('pdf_file') as File | null;
    const tableRowsJson = formData.get('table_rows') as string | null;

    // Validate required fields
    if (!invoice_number || !vendor_name || !amount_cents) {
      return NextResponse.json(
        { error: 'Missing required fields: invoice_number, vendor_name, amount_cents' },
        { status: 400 }
      );
    }

    // For even_split, template_id is optional
    // For table_template, template_id is not used
    let template: any = null;
    if (template_type === 'even_split' && template_id) {
      template = db.prepare('SELECT * FROM coding_templates WHERE id = ?').get(template_id) as any;
      if (!template) {
        return NextResponse.json(
          { error: 'Coding template not found' },
          { status: 404 }
        );
      }
    }

    // Parse table rows for table_template
    let tableRows: Array<{
      glAccountPath: string;
      categoryName: string;
      className: string;
      locationName: string;
      amount: string;
    }> = [];
    if (template_type === 'table_template') {
      if (!tableRowsJson) {
        return NextResponse.json(
          { error: 'Missing table_rows for table_template type' },
          { status: 400 }
        );
      }
      try {
        tableRows = JSON.parse(tableRowsJson);
        if (!Array.isArray(tableRows) || tableRows.length === 0) {
          return NextResponse.json(
            { error: 'table_rows must be a non-empty array' },
            { status: 400 }
          );
        }
      } catch (err) {
        return NextResponse.json(
          { error: 'Invalid table_rows JSON' },
          { status: 400 }
        );
      }
    }

    // Check if invoice number already exists
    const existing = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoice_number) as any;
    if (existing) {
      return NextResponse.json(
        { error: 'Invoice number already exists' },
        { status: 409 }
      );
    }

    // Handle PDF file upload if provided
    let pdfPath: string | null = null;
    if (pdfFileInput) {
      try {
        const buffer = await pdfFileInput.arrayBuffer();
        const invoiceDir = path.join(process.cwd(), 'email_invoices');

        // Create directory if it doesn't exist
        if (!fs.existsSync(invoiceDir)) {
          fs.mkdirSync(invoiceDir, { recursive: true });
        }

        // Generate filename: invoice_number_timestamp.pdf
        const timestamp = Date.now();
        const filename = `${invoice_number}_${timestamp}.pdf`;
        const filePath = path.join(invoiceDir, filename);

        // Write file
        fs.writeFileSync(filePath, Buffer.from(buffer));
        pdfPath = `email_invoices/${filename}`;

        console.log('[API][CREATE_FROM_TEMPLATE]', 'pdf_uploaded', {
          invoiceNumber: invoice_number,
          filename,
          size: buffer.byteLength,
        });
      } catch (err: any) {
        console.error('[API][CREATE_FROM_TEMPLATE]', 'pdf_upload_error', err);
        return NextResponse.json(
          { error: 'Failed to upload PDF file' },
          { status: 400 }
        );
      }
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
        coding_template_id,
        template_type,
        pdf_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      template_id || null,
      template_type,
      pdfPath
    );

    let allocations: any[] = [];
    let tableRowsCreated: any[] = [];

    if (template_type === 'even_split') {
      // Apply the coding template to generate allocations (even split across all offices)
      if (template_id) {
        const result = applyCodingTemplate(invoiceId, template_id, user.email);
        if (!result.success) {
          // Rollback invoice creation
          db.prepare('DELETE FROM invoices WHERE id = ?').run(invoiceId);
          return NextResponse.json(
            { error: result.error || 'Failed to apply coding template' },
            { status: 400 }
          );
        }
        allocations = db.prepare('SELECT * FROM invoice_allocations WHERE invoice_id = ?').all(invoiceId) as any[];
      } else {
        // Even split without template - create allocations for all 8 offices
        const { getAllClinics } = await import('@/lib/invoices/coding-template-service');
        const clinics = getAllClinics() as any[];
        const numClinics = clinics.length;
        const baseAmount = Math.floor(amount_cents / numClinics);
        const remainder = amount_cents % numClinics;

        for (let i = 0; i < clinics.length; i++) {
          const clinic = clinics[i];
          const allocationId = uuidv4();
          const amount = i === clinics.length - 1 ? baseAmount + remainder : baseAmount;

          db.prepare(`
            INSERT INTO invoice_allocations (
              id, invoice_id, clinic_id, amount_cents, gl_account_name,
              created_by_user_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            allocationId, invoiceId, clinic.id, amount,
            null, // No GL account specified
            user.email, now
          );

          allocations.push({
            id: allocationId,
            clinic_id: clinic.id,
            amount_cents: amount,
            gl_account_name: null,
          });
        }
      }
    } else if (template_type === 'table_template') {
      // Create table template rows and allocations
      for (const row of tableRows) {
        const rowId = uuidv4();
        const rowAmountCents = Math.round(parseFloat(row.amount) * 100);

        // Insert table template row
        db.prepare(`
          INSERT INTO table_template_rows (
            id, invoice_id, gl_account_path, category_name, class_name, location_name, amount_cents, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rowId,
          invoiceId,
          row.glAccountPath,
          row.categoryName || null,
          row.className || null,
          row.locationName || null,
          rowAmountCents,
          now
        );

        tableRowsCreated.push({
          id: rowId,
          gl_account_path: row.glAccountPath,
          category_name: row.categoryName,
          class_name: row.className,
          location_name: row.locationName,
          amount_cents: rowAmountCents,
        });

        // Create allocation for each row (if location specified, find clinic_id)
        // For now, create a generic allocation entry
        const allocationId = uuidv4();
        db.prepare(`
          INSERT INTO invoice_allocations (
            id, invoice_id, clinic_id, amount_cents, gl_account_name,
            created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          allocationId,
          invoiceId,
          null, // clinic_id will be determined later based on location_name
          rowAmountCents,
          row.glAccountPath,
          user.email,
          now
        );

        allocations.push({
          id: allocationId,
          clinic_id: null,
          amount_cents: rowAmountCents,
          gl_account_name: row.glAccountPath,
        });
      }
    }

    // Fetch the created invoice
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

    console.log('[API][CREATE_FROM_TEMPLATE]', 'invoice_created', {
      invoiceId,
      invoiceNumber: invoice_number,
      templateType: template_type,
      templateId: template_id || null,
      userEmail: user.email,
      numAllocations: allocations.length,
      numTableRows: tableRowsCreated.length,
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
        template_type: invoice.template_type,
      },
      allocations: allocations.map((a: any) => ({
        id: a.id,
        clinic_id: a.clinic_id,
        amount_cents: a.amount_cents,
        gl_account_name: a.gl_account_name,
      })),
      tableRows: tableRowsCreated,
    });
  } catch (error: any) {
    console.error('[API][CREATE_FROM_TEMPLATE]', 'error', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

