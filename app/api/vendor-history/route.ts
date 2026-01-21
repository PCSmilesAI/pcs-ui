/**
 * Vendor History API - List and Batch Operations
 * 
 * GET /api/vendor-history - List all vendors with history stats
 * POST /api/vendor-history - Manually add an invoice to history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isAdmin, isAP } from '@/lib/workflow/rolesStore';
import { getAllVendorsWithHistory, getHistoryStats, addToHistory } from '@/lib/gpt/vendorHistory';
import { convertPdfToBase64Images } from '@/lib/gpt/pdfToImages';
import * as path from 'path';
import * as fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * GET - List all vendors with history
 */
export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Check admin/AP access
    const hasAccess = await isAdmin(user.email) || await isAP(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const stats = getHistoryStats();
    const vendors = getAllVendorsWithHistory();

    return NextResponse.json({
      success: true,
      stats: {
        total_vendors: stats.total_vendors,
        total_entries: stats.total_entries,
      },
      vendors: stats.vendors,
    });
  } catch (error: any) {
    console.error('[API][VENDOR-HISTORY]', 'list_error', { error: error.message });
    return NextResponse.json({ error: 'Failed to list vendor history' }, { status: 500 });
  }
}

/**
 * POST - Manually add an invoice to history
 * 
 * Body:
 * {
 *   "vendorName": "Henry Schein",
 *   "pdfPath": "email_invoices/example.pdf",
 *   "parsedData": {
 *     "invoice_number": "...",
 *     "total": 123.45,
 *     ...
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    
    // Only admins can manually add to history
    const hasAccess = await isAdmin(user.email);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { vendorName, pdfPath, parsedData, wasCorrected } = body;

    if (!vendorName || !pdfPath) {
      return NextResponse.json(
        { error: 'vendorName and pdfPath are required' },
        { status: 400 }
      );
    }

    // Resolve PDF path
    let fullPdfPath = pdfPath;
    if (!path.isAbsolute(pdfPath)) {
      fullPdfPath = path.join(process.cwd(), pdfPath);
    }

    if (!fs.existsSync(fullPdfPath)) {
      return NextResponse.json(
        { error: `PDF file not found: ${pdfPath}` },
        { status: 404 }
      );
    }

    // Convert PDF to images
    console.log('[API][VENDOR-HISTORY]', 'converting_pdf', { pdfPath: fullPdfPath });
    const images = await convertPdfToBase64Images(fullPdfPath);

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Failed to convert PDF to images' },
        { status: 500 }
      );
    }

    // Prepare parsed data
    const data = parsedData || {};
    const invoiceNumber = data.invoice_number || null;

    const historyData = {
      invoice_number: invoiceNumber,
      invoice_date: data.invoice_date || null,
      due_date: data.due_date || null,
      vendor_name: vendorName,
      total: typeof data.total === 'number' ? data.total : parseFloat(data.total) || null,
      office_location: data.office_location || data.office || null,
      line_items: data.line_items || [],
    };

    // Add to history
    const entry = addToHistory(
      vendorName,
      invoiceNumber,
      images,
      historyData,
      wasCorrected || false
    );

    console.log('[API][VENDOR-HISTORY]', 'added_manually', {
      vendorName,
      invoiceNumber,
      entryId: entry.id,
      userEmail: user.email,
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        invoice_number: entry.invoice_number,
        added_at: entry.added_at,
        was_corrected: entry.was_corrected,
      },
    });
  } catch (error: any) {
    console.error('[API][VENDOR-HISTORY]', 'add_error', { error: error.message });
    return NextResponse.json({ error: 'Failed to add to history' }, { status: 500 });
  }
}
