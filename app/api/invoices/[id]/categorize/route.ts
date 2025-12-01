import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { categorizeInvoice, storeInvoiceCategories, getInvoiceCategories } from '@/lib/invoices/categoryParser';
import { getCurrentUser } from '@/lib/auth/currentUser';

/**
 * Categorize an invoice at the invoice level (not line-item level)
 * POST /api/invoices/[id]/categorize
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getCurrentUser(req);
    const invoiceId = params.id;
    const db = getDatabase();

    // Load invoice
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Load line items from JSON if available
    let lineItems: any[] = [];
    if (invoice.json_path) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { resolveDataPath } = await import('@/lib/workflow/dataDir');
        const jsonPath = resolveDataPath(invoice.json_path);
        if (fs.existsSync(jsonPath)) {
          const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          lineItems = jsonData.line_items || jsonData.lineItems || [];
        }
      } catch (err) {
        console.warn('[API][INVOICES][CATEGORIZE] Failed to load line items from JSON:', err);
      }
    }

    // Prepare invoice data
    const invoiceData = {
      vendor: invoice.vendor_name,
      vendor_name: invoice.vendor_name,
      line_items: lineItems,
      lineItems: lineItems,
    };

    // Categorize invoice
    const categories = await categorizeInvoice(invoiceData, invoice.vendor_name || '');

    // Store categories in database
    await storeInvoiceCategories(invoiceId, categories);

    console.log('[API][INVOICES][CATEGORIZE]', {
      invoiceId,
      invoiceNumber: invoice.invoice_number,
      vendor: invoice.vendor_name,
      categories: categories.map(c => c.categoryName),
      userEmail: user.email,
    });

    return NextResponse.json({
      success: true,
      categories: categories.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        className: c.className,
        confidenceScore: c.confidenceScore,
        flaggedForReview: c.flaggedForReview || false,
        reason: c.reason,
        source: c.source,
      })),
    });
  } catch (error: any) {
    console.error('[API][INVOICES][CATEGORIZE] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to categorize invoice' },
      { status: 500 }
    );
  }
}

/**
 * Get invoice-level categories
 * GET /api/invoices/[id]/categorize
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    const categories = getInvoiceCategories(invoiceId);

    return NextResponse.json({
      success: true,
      categories: categories.map(c => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        className: c.className,
        confidenceScore: c.confidenceScore,
        flaggedForReview: c.flaggedForReview || false,
        reason: c.reason,
        source: c.source,
      })),
    });
  } catch (error: any) {
    console.error('[API][INVOICES][CATEGORIZE] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get invoice categories' },
      { status: 500 }
    );
  }
}
