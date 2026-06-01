import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getUserPermissions } from '../../../../lib/auth/permissions';
import { getInvoiceById, saveInvoice } from '../../../../lib/invoices/db-store';
import { QBOClient } from '../../../../lib/qbo/qboClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * POST /api/invoices/verify-qbo-payments
 * 
 * Verifies payment status for a list of invoices by checking QBO Bill.Balance
 * For each paid bill (Balance = 0), updates the PCS invoice status to "completed"
 * 
 * Body: { invoiceIds: string[] }
 * 
 * Response: {
 *   ok: boolean,
 *   verified: number,
 *   paid: string[],      // invoice IDs confirmed paid
 *   unpaid: string[],    // invoice IDs still unpaid
 *   errors: string[]     // any QBO query errors
 * }
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  // Check permissions - only users who can pay invoices should verify
  const permissions = await getUserPermissions(user.email || '');
  if (!permissions.canPayInvoices) {
    return json(403, { ok: false, error: 'Unauthorized' });
  }

  try {
    const body = await req.json();
    const invoiceIds = Array.isArray(body?.invoiceIds) ? body.invoiceIds : [];

    if (invoiceIds.length === 0) {
      return json(400, { ok: false, error: 'invoiceIds required' });
    }

    console.log('[VERIFY_QBO_PAYMENTS] Starting verification for', invoiceIds.length, 'invoices');

    // Initialize QBO client
    const qboClient = new QBOClient();
    await qboClient.initialize();

    const paid: string[] = [];
    const unpaid: string[] = [];
    const errors: string[] = [];

    // Check each invoice
    for (const invoiceId of invoiceIds) {
      try {
        // Get the invoice from SQLite database
        const invoice = getInvoiceById(String(invoiceId));
        
        if (!invoice) {
          errors.push(`Invoice ${invoiceId}: not found in database`);
          continue;
        }

        const qboBillId = invoice.qbo_bill_id;
        
        if (!qboBillId) {
          errors.push(`Invoice ${invoiceId}: no QBO bill ID stored`);
          unpaid.push(invoiceId);
          continue;
        }

        // Query QBO for the bill's payment status
        const bill = await qboClient.getBillById(qboBillId);
        
        if (!bill) {
          errors.push(`Invoice ${invoiceId}: QBO bill ${qboBillId} not found`);
          unpaid.push(invoiceId);
          continue;
        }

        // Check if bill is fully paid (Balance = 0)
        if (bill.Balance === 0) {
          // Mark invoice as paid in SQLite
          invoice.status = 'paid';
          invoice.paid_at = new Date().toISOString();
          (invoice as any).payment_verified_at = new Date().toISOString();
          saveInvoice(invoice);
          
          paid.push(invoiceId);
          console.log(`[VERIFY_QBO_PAYMENTS] Invoice ${invoiceId} verified as PAID (QBO Bill ${qboBillId})`);
        } else {
          unpaid.push(invoiceId);
          console.log(`[VERIFY_QBO_PAYMENTS] Invoice ${invoiceId} still UNPAID (Balance: ${bill.Balance})`);
        }
      } catch (err: any) {
        const errMsg = `Invoice ${invoiceId}: ${err?.message || 'verification failed'}`;
        console.error('[VERIFY_QBO_PAYMENTS]', errMsg);
        errors.push(errMsg);
        unpaid.push(invoiceId);
      }
    }

    console.log('[VERIFY_QBO_PAYMENTS] Verification complete:', {
      total: invoiceIds.length,
      paid: paid.length,
      unpaid: unpaid.length,
      errors: errors.length,
    });

    return json(200, {
      ok: true,
      verified: invoiceIds.length,
      paid,
      unpaid,
      errors,
    });
  } catch (error: any) {
    console.error('[VERIFY_QBO_PAYMENTS] Unexpected error:', error?.message || error);
    return json(500, { ok: false, error: 'Failed to verify payments' });
  }
}
