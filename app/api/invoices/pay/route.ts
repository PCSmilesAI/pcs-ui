import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../lib/db/client';
import { isAdmin, isAP } from '../../../../lib/workflow/rolesStore';
import { rateLimitByUser } from '../../../../lib/ratelimit/rateLimiter';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Get QBO Bill Pay redirect URLs for invoices
 * 
 * POST /api/invoices/pay
 * Body: { invoiceIds: string[] }
 * 
 * Returns redirect URLs to QBO Bill Pay for each invoice that has a QBO bill created.
 * Users complete payment in QuickBooks, then QBO's built-in notifications handle remittance.
 */
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  // Apply rate limiting per user (100 requests per minute)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 100, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][INVOICES][PAY]', 'rate_limit_exceeded', { userEmail: user.email });
    return json(429, { ok: false, error: 'Too many requests' });
  }

  try {
    // Only admins and AP managers can process payments
    const [isAdminUser, isAPUser] = await Promise.all([
      isAdmin(user.email),
      isAP(user.email)
    ]);
    
    if (!isAdminUser && !isAPUser) {
      return json(403, { ok: false, error: 'Unauthorized - only admins and AP managers can process payments' });
    }

    const body = await req.json();
    const invoiceIds = Array.isArray(body?.invoiceIds) ? body.invoiceIds : [body?.invoiceId];
    
    if (!invoiceIds || invoiceIds.length === 0) {
      return json(400, { ok: false, error: 'invoiceIds required' });
    }

    // Get QBO connection info for redirect URL
    const tokens = await tokenStorage.getLatestTokens();
    if (!tokens?.realmId) {
      console.error('[PAYMENT] QBO not connected - no realmId');
      return json(400, { ok: false, error: 'QuickBooks not connected. Please connect to QuickBooks first.' });
    }

    const realmId = tokens.realmId;
    const qboEnvironment = process.env.QBO_ENVIRONMENT || 'sandbox';
    const qboBaseUrl = qboEnvironment === 'sandbox' 
      ? 'https://app.sandbox.qbo.intuit.com'
      : 'https://app.qbo.intuit.com';

    const db = getDatabase();
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const invoiceId of invoiceIds) {
      try {
        // Find invoice (by id or invoice_number)
        let invoice = db.prepare('SELECT id, invoice_number, qbo_bill_id, status, vendor_name, amount_cents FROM invoices WHERE id = ?').get(invoiceId) as any;
        if (!invoice) {
          invoice = db.prepare('SELECT id, invoice_number, qbo_bill_id, status, vendor_name, amount_cents FROM invoices WHERE invoice_number = ?').get(invoiceId) as any;
        }

        if (!invoice) {
          results.push({ invoiceId, ok: false, error: 'Invoice not found' });
          errorCount++;
          continue;
        }

        // Check if invoice has a QBO bill created
        if (!invoice.qbo_bill_id) {
          results.push({ 
            invoiceId, 
            ok: false, 
            error: 'No QuickBooks bill found for this invoice. Please approve the invoice first to create a QBO bill.' 
          });
          errorCount++;
          continue;
        }

        // Check invoice status - should be to_be_paid or approved
        const status = (invoice.status || '').toLowerCase();
        if (!['to_be_paid', 'approved'].includes(status)) {
          results.push({ 
            invoiceId, 
            ok: false, 
            error: `Invoice is not ready for payment (status: ${invoice.status})` 
          });
          errorCount++;
          continue;
        }

        // Build QBO Bill URLs
        // The bill view URL shows the full bill with vendor, amount, memo, and attachments
        // From there, users can click "Pay bill" within QBO
        const qboBillViewUrl = `${qboBaseUrl}/app/bill?txnId=${invoice.qbo_bill_id}`;
        
        // The billpayment URL is for creating a check payment (starts blank - not what we want)
        const qboBillPayUrl = `${qboBaseUrl}/app/billpayment?txnId=${invoice.qbo_bill_id}`;

        results.push({
          invoiceId,
          invoiceNumber: invoice.invoice_number,
          vendorName: invoice.vendor_name,
          amount: invoice.amount_cents ? (invoice.amount_cents / 100).toFixed(2) : null,
          ok: true,
          qboBillId: invoice.qbo_bill_id,
          // Use bill VIEW URL as primary - shows the bill with all details
          payUrl: qboBillViewUrl,
          viewUrl: qboBillViewUrl,
          // Keep the bill payment URL as an alternative
          billPaymentUrl: qboBillPayUrl,
        });
        successCount++;

        console.log('[PAYMENT] QBO Bill Pay URL generated', {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          qboBillId: invoice.qbo_bill_id,
          userEmail: user.email,
        });

      } catch (err: any) {
        console.error('[PAYMENT] Error processing invoice', {
          invoiceId,
          error: err?.message,
        });
        results.push({
          invoiceId,
          ok: false,
          error: 'Failed to generate payment URL',
        });
        errorCount++;
      }
    }

    return json(200, {
      ok: true,
      successCount,
      errorCount,
      results,
      qboRealmId: realmId,
      qboBaseUrl,
      message: successCount > 0 
        ? `Generated ${successCount} QBO Bill Pay URL(s). Click to complete payment in QuickBooks.`
        : 'No valid invoices found for payment.',
    });
  } catch (error: any) {
    console.error('[PAYMENT] Unexpected error', { error: error?.message });
    return json(500, { ok: false, error: 'Payment processing failed' });
  }
}
