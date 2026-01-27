/**
 * Convert to Invoice API
 * 
 * POST /api/other-documents/[id]/convert-to-invoice - Convert a document back to an invoice
 * 
 * This endpoint:
 * 1. Gets the document from other_documents
 * 2. Triggers GPT re-parsing as an invoice
 * 3. Creates a new invoice record
 * 4. Deletes the document from other_documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';
import { parseInvoiceWithGPT } from '@/lib/gpt/parseInvoice';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * Resolve PDF path to absolute filesystem path
 */
function resolvePdfPath(pdfPath: string): string | null {
  if (!pdfPath) return null;

  // Extract filename from any path format
  let filename = pdfPath;

  if (pdfPath.includes('/')) {
    const parts = pdfPath.split('/');
    filename = parts[parts.length - 1] || '';
  }

  if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  // Try multiple possible locations
  const possiblePaths = [
    path.join(process.cwd(), 'pcs_ui_data', 'email_invoices', filename),
    path.join(process.cwd(), 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'email_invoices', filename),
    path.join(process.cwd(), 'public', 'pdfs', filename),
  ];

  for (const tryPath of possiblePaths) {
    if (fs.existsSync(tryPath)) {
      return tryPath;
    }
  }

  return null;
}

/**
 * POST /api/other-documents/[id]/convert-to-invoice
 * Convert a document back to an invoice by re-parsing with GPT
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(request);
    const documentId = params.id;

    // Check access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    // Get the document
    const document = db.prepare('SELECT * FROM other_documents WHERE id = ?').get(documentId) as any;
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check if we have a PDF to parse
    if (!document.pdf_path) {
      return NextResponse.json({ error: 'Document has no PDF to parse' }, { status: 400 });
    }

    // Resolve the PDF path
    const resolvedPath = resolvePdfPath(document.pdf_path);
    if (!resolvedPath) {
      console.error('[API][CONVERT-TO-INVOICE] Could not resolve PDF path:', document.pdf_path);
      return NextResponse.json({ 
        error: 'PDF file not found. The file may have been moved or deleted.',
        pdf_path: document.pdf_path 
      }, { status: 404 });
    }

    console.log('[API][CONVERT-TO-INVOICE] Parsing PDF as invoice:', {
      documentId,
      resolvedPath,
      originalType: document.document_type
    });

    // Parse with GPT as an invoice
    let parseResult;
    try {
      parseResult = await parseInvoiceWithGPT(
        resolvedPath, 
        document.vendor_name || null  // Pass vendor hint if available
      );
    } catch (parseError: any) {
      console.error('[API][CONVERT-TO-INVOICE] GPT parsing failed:', parseError);
      return NextResponse.json({
        error: 'Failed to parse document as invoice',
        details: parseError.message
      }, { status: 500 });
    }

    if (!parseResult.success) {
      return NextResponse.json({
        error: 'GPT could not parse this as an invoice',
        details: parseResult.error
      }, { status: 400 });
    }

    const parsed = parseResult.data;

    // Generate new invoice ID
    const invoiceId = randomUUID();
    
    // Generate invoice number (use parsed or create from timestamp)
    const invoiceNumber = parsed.invoice_number || `CONVERTED-${Date.now()}`;
    
    // Check if invoice number already exists
    const existingInvoice = db.prepare(
      'SELECT id FROM invoices WHERE invoice_number = ?'
    ).get(invoiceNumber) as any;
    
    if (existingInvoice) {
      return NextResponse.json({
        error: 'An invoice with this number already exists',
        existingInvoiceId: existingInvoice.id,
        invoiceNumber
      }, { status: 409 });
    }

    // Calculate amount in cents
    const amountCents = parsed.total 
      ? Math.round(parseFloat(String(parsed.total).replace(/[^0-9.-]/g, '')) * 100) 
      : (document.amount ? Math.round(document.amount * 100) : 0);

    // Normalize PDF path for storage
    const pdfFilename = document.pdf_path.split('/').pop();
    const normalizedPdfPath = `/api/pdf/${pdfFilename}`;

    // Insert into invoices table
    db.prepare(`
      INSERT INTO invoices (
        id,
        invoice_number,
        source_file,
        source_message_id,
        parsed_vendor_name,
        parsed_office_id,
        parsed_amount_cents,
        vendor_name,
        office_id,
        amount_cents,
        invoice_date,
        due_date,
        status,
        parsing_status,
        parsing_confidence,
        pdf_path,
        email_subject,
        email_from,
        deleted,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      invoiceId,
      invoiceNumber,
      normalizedPdfPath,
      document.source_email_id || null,
      parsed.vendor_name || document.vendor_name || null,
      parsed.office_location || null,
      amountCents,
      parsed.vendor_name || document.vendor_name || null,
      parsed.office_location || null,
      amountCents,
      parsed.invoice_date || document.document_date || null,
      parsed.due_date || null,
      'incoming', // Start as incoming for review
      parseResult.success ? 'success' : 'partial',
      parsed.confidence || 0.8,
      normalizedPdfPath,
      document.email_subject || null,
      document.email_from || null,
      now,
      now
    );

    // Delete from other_documents
    db.prepare('DELETE FROM other_documents WHERE id = ?').run(documentId);

    console.log('[API][CONVERT-TO-INVOICE] Successfully converted:', {
      documentId,
      newInvoiceId: invoiceId,
      invoiceNumber,
      vendor: parsed.vendor_name || document.vendor_name,
      amount: amountCents / 100
    });

    return NextResponse.json({
      success: true,
      message: 'Document converted to invoice successfully',
      invoice: {
        id: invoiceId,
        invoice_number: invoiceNumber,
        vendor_name: parsed.vendor_name || document.vendor_name,
        amount: amountCents / 100,
        status: 'incoming'
      },
      parsing: {
        status: parseResult.success ? 'success' : 'partial',
        confidence: parsed.confidence
      }
    });

  } catch (error: any) {
    console.error('[API][CONVERT-TO-INVOICE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
