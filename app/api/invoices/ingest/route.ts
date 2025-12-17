import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { applyParserUpdate } from '../../../../lib/invoices/write';
import { isTombstoned } from '../../../../lib/invoices/tombstoneService';
import { normalizeVendorNameForStorage } from '../../../../lib/invoices/vendorNormalization';
import { buildApiPdfPath, normalizePdfFilename } from '../../../../lib/security/filename';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

interface IngestPayload {
  invoice_number: string;
  vendor: string;
  total?: string | number;
  office_location?: string;
  invoice_date?: string;
  clinic_id?: string;
  source_file?: string;
  json_path?: string;
  pdf_path?: string;
  parsing_status?: 'success' | 'failed' | 'partial';
  parsing_error?: string;
  [key: string]: any;
}

/**
 * Ingest a parsed invoice from the parser/queue writer.
 * This endpoint is called by invoice_queue_writer.py after parsing.
 * It inserts the invoice into the database with parsed_* fields.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as IngestPayload;
    
    // Use fallback values for missing fields - ingest ALL invoices even with missing data
    const invoice_number = body.invoice_number || 
      body.source_file?.replace(/\.(pdf|json)$/i, '') || 
      body.json_path?.replace(/\.json$/i, '')?.split('/').pop() || 
      `UNKNOWN-${Date.now()}`;
    
    const vendor = body.vendor || 'Unknown Vendor';

    const db = getDatabase();

    // Check if invoice has been tombstoned (rejected/deleted)
    if (isTombstoned(body.source_file)) {
      console.log('[API][INGEST]', 'invoice_tombstoned', {
        invoiceNumber: body.invoice_number,
        sourceFile: body.source_file
      });
      return NextResponse.json(
        { ok: true, message: 'Invoice was previously rejected and cannot be re-ingested', skipped: true },
        { status: 200 }
      );
    }

    // Check if invoice already exists - use source_file as primary check, fallback to invoice_number
    const normalizedPdfFilename = body.pdf_path ? normalizePdfFilename(body.pdf_path) : undefined;
    const normalizedPdfPath = normalizedPdfFilename ? buildApiPdfPath(normalizedPdfFilename) : undefined;

    const sourceFile = body.source_file || body.json_path || normalizedPdfFilename;
    let existing: { id: string } | undefined = undefined;
    
    if (sourceFile) {
      existing = db.prepare(
        'SELECT id FROM invoices WHERE source_file = ?'
      ).get(sourceFile) as { id: string } | undefined;
    }
    
    // Fallback check by invoice_number if source_file check didn't find it
    if (!existing && invoice_number) {
      existing = db.prepare(
        'SELECT id FROM invoices WHERE invoice_number = ?'
      ).get(invoice_number) as { id: string } | undefined;
    }

    if (existing) {
      return NextResponse.json(
        { ok: true, message: 'Invoice already exists', id: (existing as any).id },
        { status: 200 }
      );
    }

    // Generate ID
    const id = randomUUID();

    // Normalize vendor name
    const normalizedVendor = normalizeVendorNameForStorage(body.vendor);

    // Parse amount
    let amountCents = 0;
    if (body.total) {
      const totalStr = String(body.total).replace(/[^0-9.]/g, '');
      const totalNum = parseFloat(totalStr);
      if (!isNaN(totalNum)) {
        amountCents = Math.round(totalNum * 100);
      }
    }

    // Determine parsing status based on data quality
    // If parsing_status was provided, use it; otherwise infer from data
    let parsingStatus = body.parsing_status || 'success';
    let parsingError = body.parsing_error || null;
    
    // Check for parsing issues if status wasn't explicitly set
    if (!body.parsing_status) {
      const hasAmount = amountCents > 0;
      const hasValidInvoiceNumber = body.invoice_number && 
        !body.invoice_number.startsWith('UNKNOWN-') && 
        body.invoice_number.trim() !== '';
      const hasValidVendor = body.vendor && 
        body.vendor !== 'Unknown' && 
        body.vendor !== 'Unknown Vendor' &&
        body.vendor.trim() !== '';
      
      if (!hasAmount && !hasValidInvoiceNumber && !hasValidVendor) {
        parsingStatus = 'failed';
        parsingError = 'No data extracted from invoice';
      } else if (!hasAmount) {
        parsingStatus = 'partial';
        parsingError = 'Invoice total not extracted';
      } else if (!hasValidInvoiceNumber) {
        parsingStatus = 'partial';
        parsingError = 'Invoice number not extracted';
      } else if (!hasValidVendor) {
        parsingStatus = 'partial';
        parsingError = 'Vendor name not extracted';
      }
    }

    // Log parsing issues for monitoring
    if (parsingStatus !== 'success') {
      console.warn('[API][INGEST] PARSING_ISSUE:', {
        status: parsingStatus,
        error: parsingError,
        invoice_number: invoice_number,
        vendor: vendor,
        amountCents,
        sourceFile: body.source_file
      });
    }

    // Insert invoice with parsed_* fields including parsing status
    db.prepare(`
      INSERT INTO invoices (
        id,
        invoice_number,
        source_file,
        parsed_vendor_name,
        parsed_office_id,
        parsed_amount_cents,
        vendor_name,
        office_id,
        amount_cents,
        status,
        approvals,
        deleted,
        invoice_date,
        description,
        clinic_id,
        office_location,
        pdf_path,
        parsing_status,
        parsing_error,
        parse_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      invoice_number,
      body.source_file || body.json_path || normalizedPdfFilename,
      normalizedVendor,  // parsed (normalized)
      body.office_location || body.clinic_id,
      amountCents,
      normalizedVendor,  // effective = parsed initially (normalized)
      body.office_location || body.clinic_id,  // effective
      amountCents,  // effective
      'incoming',
      JSON.stringify({}),
      0,
      body.invoice_date,
      '',
      body.clinic_id,
      body.office_location,
      normalizedPdfPath,
      parsingStatus,
      parsingError,
      1  // First parse attempt
    );

    // Audit event
    db.prepare(`
      INSERT INTO invoice_events (invoice_id, action, payload_json)
      VALUES (?, 'PARSED_UPDATE', ?)
    `).run(id, JSON.stringify({
      vendor: body.vendor,
      amount_cents: amountCents,
      office_location: body.office_location,
      source: 'parser'
    }));

    // Auto-categorize invoice based on vendor
    try {
      const { categorizeInvoice, storeInvoiceCategories } = await import('@/lib/invoices/categoryParser');
      const categories = await categorizeInvoice(
        {
          vendor_name: vendor,
          line_items: body.line_items || [],
        },
        vendor
      );
      await storeInvoiceCategories(id, categories);
      console.log('[API][INGEST] Auto-categorized invoice', {
        invoiceId: id,
        categories: categories.map(c => c.categoryName),
      });
    } catch (err: any) {
      console.warn('[API][INGEST] Failed to auto-categorize invoice:', err?.message);
      // Don't fail the ingest if categorization fails
    }

    console.log('[API][INGEST]', 'invoice_ingested', {
      invoiceNumber: invoice_number,
      vendor: vendor,
      amountCents,
      id,
      parsingStatus,
      hadMissingFields: !body.invoice_number || !body.vendor
    });

    return NextResponse.json({
      ok: true,
      message: 'Invoice ingested successfully',
      id,
      invoice_number: invoice_number,
      parsing_status: parsingStatus
    });
  } catch (err: any) {
    // Log full error server-side only
    console.error('[API][INGEST]', 'error', { error: err?.message });
    // Return safe error message to client
    return NextResponse.json(
      { error: 'Ingestion failed' },
      { status: 500 }
    );
  }
}
