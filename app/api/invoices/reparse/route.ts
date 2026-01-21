/**
 * Invoice Reparse API
 * 
 * POST /api/invoices/reparse - Reparse a single invoice using GPT-5 nano
 * GET /api/invoices/reparse - Get bulk parse progress status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin } from '@/lib/workflow/rolesStore';
import { parseInvoiceWithGPT } from '@/lib/gpt/parseInvoice';
import { getDatabase } from '@/lib/db/client';
import { loadProgress, BulkParseProgress } from '@/lib/gpt/bulkParse';
import * as path from 'path';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * GET - Get bulk parse progress status
 */
export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Only admins can view parse status
    const hasAccess = await isAdmin(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const progress = loadProgress();
    
    if (!progress) {
      return NextResponse.json({
        success: true,
        hasProgress: false,
        message: 'No bulk parse in progress or completed',
      });
    }

    return NextResponse.json({
      success: true,
      hasProgress: true,
      progress: {
        total: progress.total,
        processed: progress.processed,
        successful: progress.successful,
        failed: progress.failed,
        skipped: progress.skipped,
        percentComplete: progress.total > 0 
          ? Math.round((progress.processed / progress.total) * 100) 
          : 0,
        isRunning: progress.isRunning,
        currentFile: progress.currentFile,
        startedAt: progress.startedAt,
        lastUpdated: progress.lastUpdated,
        errorCount: progress.errors.length,
        recentErrors: progress.errors.slice(-5),
      },
    });
  } catch (error: any) {
    console.error('[API][REPARSE] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
}

/**
 * POST - Reparse a single invoice
 * 
 * Body:
 * {
 *   "invoiceId": "abc123",       // Reparse by invoice ID
 *   // OR
 *   "pdfPath": "email_invoices/file.pdf"  // Reparse by PDF path
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Only admins can trigger reparse
    const hasAccess = await isAdmin(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { invoiceId, pdfPath } = body;

    if (!invoiceId && !pdfPath) {
      return NextResponse.json(
        { error: 'Either invoiceId or pdfPath is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    let fullPdfPath: string;
    let existingInvoice: any = null;

    // If invoiceId provided, look up the PDF path
    if (invoiceId) {
      existingInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
      if (!existingInvoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      
      fullPdfPath = existingInvoice.pdf_path || existingInvoice.source_file;
      if (!fullPdfPath) {
        return NextResponse.json(
          { error: 'Invoice has no associated PDF path' },
          { status: 400 }
        );
      }
    } else {
      fullPdfPath = pdfPath;
    }

    // Resolve full path
    if (!path.isAbsolute(fullPdfPath)) {
      fullPdfPath = path.join(process.cwd(), fullPdfPath);
    }

    // Check file exists
    if (!fs.existsSync(fullPdfPath)) {
      return NextResponse.json(
        { error: `PDF file not found: ${pdfPath || fullPdfPath}` },
        { status: 404 }
      );
    }

    // Parse with GPT
    console.log('[API][REPARSE] Reparsing:', fullPdfPath);
    const result = await parseInvoiceWithGPT(fullPdfPath);

    if (!result.success || !result.data) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to parse invoice',
        vendorDetected: result.vendorDetected,
      }, { status: 500 });
    }

    // Update existing invoice or return parsed data
    if (existingInvoice) {
      const totalCents = result.data.total ? Math.round(result.data.total * 100) : null;

      // Store line items as description JSON
      const lineItemsDescription = result.data.line_items && result.data.line_items.length > 0
        ? `Line items: ${JSON.stringify(result.data.line_items)}`
        : null;

      db.prepare(`
        UPDATE invoices SET
          parsed_vendor_name = ?,
          vendor_name = COALESCE(corrected_vendor_name, ?),
          parsed_office_id = ?,
          office_location = COALESCE(corrected_office_id, ?),
          parsed_amount_cents = ?,
          amount_cents = COALESCE(corrected_amount_cents, ?),
          total = ?,
          invoice_total = ?,
          invoice_date = ?,
          due_date = ?,
          parsing_method = ?,
          parsing_confidence = ?,
          parsing_error = NULL,
          description = COALESCE(description, ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        result.data.vendor_name,
        result.data.vendor_name,
        result.data.office_location,
        result.data.office_location,
        totalCents,
        totalCents,
        result.data.total,
        result.data.total,
        result.data.invoice_date,
        result.data.due_date,
        'gpt-5-nano',
        result.data.parsing_confidence,
        lineItemsDescription,
        invoiceId
      );

      console.log('[API][REPARSE] Updated invoice:', invoiceId);

      return NextResponse.json({
        success: true,
        message: 'Invoice reparsed and updated',
        invoiceId,
        parsedData: result.data,
        vendorDetected: result.vendorDetected,
        knowledgeBaseUsed: result.knowledgeBaseUsed,
      });
    }

    // Just return parsed data (no invoice to update)
    return NextResponse.json({
      success: true,
      message: 'PDF parsed successfully',
      parsedData: result.data,
      vendorDetected: result.vendorDetected,
      knowledgeBaseUsed: result.knowledgeBaseUsed,
    });

  } catch (error: any) {
    console.error('[API][REPARSE] POST error:', error.message);
    return NextResponse.json(
      { error: 'Failed to reparse invoice', details: error.message },
      { status: 500 }
    );
  }
}
