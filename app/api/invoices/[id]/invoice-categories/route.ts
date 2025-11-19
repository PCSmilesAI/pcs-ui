import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * GET /api/invoices/[id]/invoice-categories
 * Load invoice-level categories for a specific invoice
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    
    // Get categories for this invoice
    const categories = db
      .prepare(
        `SELECT category_id as id, category_name as name, source 
         FROM invoice_categories 
         WHERE invoice_id = ? 
         ORDER BY created_at ASC`
      )
      .all(invoiceId) as any[];

    return NextResponse.json({
      categories: categories || []
    });
  } catch (error: any) {
    console.error('❌ Error loading invoice categories:', error);
    return NextResponse.json(
      { error: 'Failed to load categories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoices/[id]/invoice-categories
 * Save invoice-level categories for a specific invoice
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { categories } = body;

    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Categories must be an array' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    // Verify invoice exists
    const invoice = db
      .prepare('SELECT id FROM invoices WHERE id = ?')
      .get(invoiceId);
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Delete existing categories for this invoice
    db.prepare('DELETE FROM invoice_categories WHERE invoice_id = ?').run(
      invoiceId
    );

    // Insert new categories
    const insertStmt = db.prepare(
      `INSERT INTO invoice_categories (id, invoice_id, category_id, category_name, source)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const cat of categories) {
      if (cat.id && cat.name) {
        insertStmt.run(
          uuidv4(),
          invoiceId,
          cat.id,
          cat.name,
          cat.source || 'manual'
        );
      }
    }

    console.log(`✅ Saved ${categories.length} categories for invoice ${invoiceId}`);

    return NextResponse.json({
      success: true,
      message: `Saved ${categories.length} categories`,
      categories
    });
  } catch (error: any) {
    console.error('❌ Error saving invoice categories:', error);
    return NextResponse.json(
      { error: 'Failed to save categories' },
      { status: 500 }
    );
  }
}

