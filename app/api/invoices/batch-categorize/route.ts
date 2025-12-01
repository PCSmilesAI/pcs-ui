import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/db/client';
import { categorizeInvoice, storeInvoiceCategories } from '../../../../lib/invoices/categoryParser';

export const dynamic = 'force-dynamic';

/**
 * Batch categorize all invoices that don't have categories yet
 * This endpoint processes invoices in batches to avoid timeout
 */
export async function POST(req: NextRequest) {
  try {
    const db = getDatabase();
    const batchSize = 50; // Process 50 at a time

    // Get invoices without categories
    const invoicesWithoutCategories = db.prepare(`
      SELECT DISTINCT i.id, i.vendor_name
      FROM invoices i
      LEFT JOIN invoice_categories ic ON i.id = ic.invoice_id
      WHERE ic.invoice_id IS NULL
      AND i.deleted = 0
      LIMIT ?
    `).all(batchSize) as Array<{ id: string; vendor_name: string }>;

    console.log(`[API][BATCH_CATEGORIZE] Processing ${invoicesWithoutCategories.length} invoices`);

    let categorized = 0;
    let failed = 0;

    for (const invoice of invoicesWithoutCategories) {
      try {
        const categories = await categorizeInvoice(
          { vendor_name: invoice.vendor_name, line_items: [] },
          invoice.vendor_name
        );
        await storeInvoiceCategories(invoice.id, categories);
        categorized++;
      } catch (err: any) {
        console.warn(`[API][BATCH_CATEGORIZE] Failed to categorize invoice ${invoice.id}:`, err?.message);
        failed++;
      }
    }

    // Get total remaining
    const remaining = db.prepare(`
      SELECT COUNT(DISTINCT i.id) as count
      FROM invoices i
      LEFT JOIN invoice_categories ic ON i.id = ic.invoice_id
      WHERE ic.invoice_id IS NULL
      AND i.deleted = 0
    `).get() as { count: number };

    console.log(`[API][BATCH_CATEGORIZE] Batch complete: ${categorized} categorized, ${failed} failed, ${remaining.count} remaining`);

    return NextResponse.json({
      success: true,
      categorized,
      failed,
      remaining: remaining.count,
      message: `Categorized ${categorized} invoices, ${remaining.count} remaining`
    });
  } catch (err: any) {
    console.error('[API][BATCH_CATEGORIZE] Error:', err?.message);
    return NextResponse.json(
      { error: 'Batch categorization failed', details: err?.message },
      { status: 500 }
    );
  }
}

