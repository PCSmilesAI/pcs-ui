import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';
import { categorizeInvoice } from '@/lib/invoices/categoryParser';

interface CategoryInput {
  id?: string;
  categoryId?: string;
  categoryName?: string;
  name?: string;
  classId?: string;
  className?: string;
  description?: string;
  amount?: number;
  amountCents?: number;
  sequence?: number;
  source?: string;
}

interface CategoryOutput {
  id: string;
  sequence: number;
  categoryId: string;
  categoryName: string;
  classId: string | null;
  className: string | null;
  description: string | null;
  amount: number;
  source: string;
}

/**
 * GET /api/invoices/[id]/invoice-categories
 * Load invoice-level categories for a specific invoice with allocation summary
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
    
    // Get invoice to fetch total amount
    const invoice = db
      .prepare(
        `SELECT id, invoice_number, amount_cents, total, invoice_total, vendor_name
         FROM invoices 
         WHERE id = ?`
      )
      .get(invoiceId) as any;

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Calculate invoice total in dollars
    let totalAmount = 0;
    if (invoice.amount_cents) {
      totalAmount = invoice.amount_cents / 100;
    } else if (invoice.total) {
      totalAmount = typeof invoice.total === 'string' ? parseFloat(invoice.total) : invoice.total;
    } else if (invoice.invoice_total) {
      totalAmount = typeof invoice.invoice_total === 'string' ? parseFloat(invoice.invoice_total) : invoice.invoice_total;
    }
    totalAmount = Math.round(totalAmount * 100) / 100; // Round to 2 decimal places

    // Get categories for this invoice with all fields
    const categories = db
      .prepare(
        `SELECT 
           id,
           category_id,
           category_name,
           class_id,
           class_name,
           description,
           amount_cents,
           sequence,
           source
         FROM invoice_categories 
         WHERE invoice_id = ? 
         ORDER BY sequence ASC, created_at ASC`
      )
      .all(invoiceId) as any[];

    // Transform categories to output format
    // If categories exist but have no amounts (legacy data), distribute amount evenly
    const hasAmounts = categories.some(cat => cat.amount_cents && cat.amount_cents > 0);
    const amountPerCategory = hasAmounts ? 0 : (totalAmount / (categories.length || 1));
    
    const transformedCategories: CategoryOutput[] = categories.map((cat, idx) => ({
      id: cat.id,
      sequence: cat.sequence || (idx + 1),
      categoryId: cat.category_id,
      categoryName: cat.category_name,
      classId: cat.class_id || null,
      className: cat.class_name || null,
      description: cat.description || null,
      // Use stored amount if available, otherwise distribute evenly for legacy data
      amount: cat.amount_cents ? cat.amount_cents / 100 : amountPerCategory,
      source: cat.source || 'manual'
    }));

    // If no categories exist, auto-categorize based on vendor mapping
    if (transformedCategories.length === 0 && totalAmount > 0) {
      const vendorName = invoice.vendor_name || '';
      
      try {
        // Use the auto-categorization logic to get suggested category from vendor mapping
        const suggestedCategories = await categorizeInvoice(
          { line_items: [], lineItems: [] }, // Empty line items - vendor mapping takes priority
          vendorName
        );
        
        if (suggestedCategories && suggestedCategories.length > 0) {
          const suggested = suggestedCategories[0];
          console.log('[GL_LINES] Auto-categorized from vendor mapping', {
            invoiceId,
            vendor: vendorName,
            category: suggested.categoryName,
            class: suggested.className,
            source: suggested.source
          });
          
          transformedCategories.push({
            id: '',
            sequence: 1,
            categoryId: suggested.categoryId || '',
            categoryName: suggested.categoryName,
            classId: null,
            className: suggested.className || null,
            description: '',
            amount: totalAmount,
            source: suggested.source || 'vendor_mapping'
          });
        } else {
          // Fallback to empty category if no mapping found
          transformedCategories.push({
            id: '',
            sequence: 1,
            categoryId: '',
            categoryName: '',
            classId: null,
            className: null,
            description: '',
            amount: totalAmount,
            source: 'default'
          });
        }
      } catch (error) {
        console.warn('[GL_LINES] Auto-categorization failed, using empty default', error);
        transformedCategories.push({
          id: '',
          sequence: 1,
          categoryId: '',
          categoryName: '',
          classId: null,
          className: null,
          description: '',
          amount: totalAmount,
          source: 'default'
        });
      }
    }

    // Calculate allocation summary
    const allocatedAmount = transformedCategories.reduce((sum, cat) => sum + (cat.amount || 0), 0);
    const roundedAllocated = Math.round(allocatedAmount * 100) / 100;
    const unallocatedAmount = Math.round((totalAmount - roundedAllocated) * 100) / 100;

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        vendorName: invoice.vendor_name,
        totalAmount: totalAmount
      },
      categories: transformedCategories,
      summary: {
        totalAmount: totalAmount,
        allocated: roundedAllocated,
        unallocated: unallocatedAmount
      }
    });
  } catch (error: any) {
    console.error('❌ Error loading invoice categories:', error);
    return NextResponse.json(
      { error: 'Failed to load categories', detail: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoices/[id]/invoice-categories
 * Save invoice-level categories with amount validation
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
    const { categories } = body as { categories: CategoryInput[] };

    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Categories must be an array' },
        { status: 400 }
      );
    }

    const db = getDatabase();

    // Get invoice total for validation
    const invoice = db
      .prepare(
        `SELECT id, amount_cents, total, invoice_total
         FROM invoices 
         WHERE id = ?`
      )
      .get(invoiceId) as any;
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Calculate invoice total
    let invoiceTotalCents = 0;
    if (invoice.amount_cents) {
      invoiceTotalCents = invoice.amount_cents;
    } else if (invoice.total) {
      const total = typeof invoice.total === 'string' ? parseFloat(invoice.total) : invoice.total;
      invoiceTotalCents = Math.round(total * 100);
    } else if (invoice.invoice_total) {
      const total = typeof invoice.invoice_total === 'string' ? parseFloat(invoice.invoice_total) : invoice.invoice_total;
      invoiceTotalCents = Math.round(total * 100);
    }

    // Calculate allocated total from submitted categories
    let allocatedTotalCents = 0;
    for (const cat of categories) {
      if (cat.amountCents !== undefined) {
        allocatedTotalCents += cat.amountCents;
      } else if (cat.amount !== undefined) {
        allocatedTotalCents += Math.round(cat.amount * 100);
      }
    }

    // Validate: allocated must equal invoice total (within 1 cent tolerance)
    const tolerance = 1; // Allow 1 cent difference for rounding
    const difference = Math.abs(invoiceTotalCents - allocatedTotalCents);
    
    if (difference > tolerance) {
      const invoiceTotal = invoiceTotalCents / 100;
      const allocated = allocatedTotalCents / 100;
      const unallocated = (invoiceTotalCents - allocatedTotalCents) / 100;
      
      return NextResponse.json(
        { 
          error: 'Amount mismatch',
          message: `Unallocated amount must be zero. Invoice total: $${invoiceTotal.toFixed(2)}, Allocated: $${allocated.toFixed(2)}, Unallocated: $${unallocated.toFixed(2)}`,
          summary: {
            totalAmount: invoiceTotal,
            allocated: allocated,
            unallocated: unallocated
          }
        },
        { status: 400 }
      );
    }

    // Delete existing categories for this invoice
    db.prepare('DELETE FROM invoice_categories WHERE invoice_id = ?').run(invoiceId);

    // Insert new categories with all fields
    const insertStmt = db.prepare(
      `INSERT INTO invoice_categories (
        id, invoice_id, category_id, category_name, class_id, class_name, 
        description, amount_cents, sequence, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const now = new Date().toISOString();
    const savedCategories: CategoryOutput[] = [];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const categoryId = cat.categoryId || cat.id || uuidv4();
      const categoryName = cat.categoryName || cat.name || '';
      const sequence = cat.sequence ?? (i + 1);
      
      // Calculate amount in cents
      let amountCents = 0;
      if (cat.amountCents !== undefined) {
        amountCents = cat.amountCents;
      } else if (cat.amount !== undefined) {
        amountCents = Math.round(cat.amount * 100);
      }

      // Skip empty categories (no account selected and no amount)
      if (!categoryName && amountCents === 0) {
        continue;
      }

      const recordId = uuidv4();
      
      insertStmt.run(
        recordId,
        invoiceId,
        categoryId,
        categoryName,
        cat.classId || null,
        cat.className || null,
        cat.description || null,
        amountCents,
        sequence,
        cat.source || 'manual',
        now
      );

      savedCategories.push({
        id: recordId,
        sequence: sequence,
        categoryId: categoryId,
        categoryName: categoryName,
        classId: cat.classId || null,
        className: cat.className || null,
        description: cat.description || null,
        amount: amountCents / 100,
        source: cat.source || 'manual'
      });
    }

    console.log(`✅ Saved ${savedCategories.length} GL lines for invoice ${invoiceId}`);

    // Return updated summary
    const allocatedAmount = savedCategories.reduce((sum, cat) => sum + cat.amount, 0);
    const totalAmount = invoiceTotalCents / 100;

    return NextResponse.json({
      success: true,
      message: `Saved ${savedCategories.length} GL lines`,
      categories: savedCategories,
      summary: {
        totalAmount: totalAmount,
        allocated: allocatedAmount,
        unallocated: Math.round((totalAmount - allocatedAmount) * 100) / 100
      }
    });
  } catch (error: any) {
    console.error('❌ Error saving invoice categories:', error);
    return NextResponse.json(
      { error: 'Failed to save categories', detail: error.message },
      { status: 500 }
    );
  }
}
