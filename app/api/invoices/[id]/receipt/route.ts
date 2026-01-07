import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceById } from '../../../../../lib/invoices/db-store';

export const dynamic = 'force-dynamic';

/**
 * Generate payment receipt data for a paid invoice.
 * This returns JSON data that can be rendered as a receipt page.
 * Does NOT include vendor-specific info - just payment verification data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    
    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
    }
    
    // Fetch invoice from database
    const invoice = getInvoiceById(invoiceId);
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    // Only allow receipt generation for paid invoices
    if (invoice.status?.toLowerCase() !== 'paid') {
      return NextResponse.json(
        { error: 'Receipt only available for paid invoices' },
        { status: 400 }
      );
    }
    
    // Format amount from cents to dollars
    const amountCents = invoice.amount_cents || 0;
    const amountFormatted = (amountCents / 100).toFixed(2);
    
    // Build receipt data - exclude vendor-specific info
    const receiptData = {
      // Invoice identifiers
      invoiceNumber: invoice.invoice_number || invoice.id,
      invoiceId: invoice.id,
      
      // Payment details
      paymentAmount: amountFormatted,
      paymentAmountCents: amountCents,
      paymentDate: invoice.paid_at || null,
      paidBy: invoice.paid_by_user_id || null,
      
      // Stripe transfer reference
      stripeTransferId: invoice.stripe_transfer_id || null,
      
      // Workflow timestamps (for audit trail)
      codedAt: invoice.coded_at || null,
      codedBy: invoice.coded_by_user_id || null,
      approvedAt: invoice.approved_at || null,
      approvedBy: invoice.approved_by_user_id || null,
      
      // Invoice dates
      invoiceDate: invoice.invoice_date || null,
      dueDate: invoice.due_date || null,
      
      // Company info
      companyName: process.env.COMPANY_NAME || 'Pacific Crest Smiles',
      
      // Receipt generation metadata
      generatedAt: new Date().toISOString(),
    };
    
    return NextResponse.json({
      ok: true,
      receipt: receiptData,
    });
    
  } catch (error: any) {
    console.error('[API][INVOICE][RECEIPT] Error:', error?.message);
    return NextResponse.json(
      { error: 'Failed to generate receipt' },
      { status: 500 }
    );
  }
}





