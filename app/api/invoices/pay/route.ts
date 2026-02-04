import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getDatabase } from '../../../../lib/db/client';
import { isAdmin, isAP } from '../../../../lib/workflow/rolesStore';
import { rateLimitByUser } from '../../../../lib/ratelimit/rateLimiter';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';
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
 * Generate a unique batch payment ID
 * Format: PCS-PAY-YYYYMMDD-HHMM-XXX (e.g., PCS-PAY-20260122-1430-A7B)
 */
function generateBatchId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 5).replace(':', '');
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `PCS-PAY-${date}-${time}-${random}`;
}

/**
 * Get QBO Bill Pay redirect URLs for invoices
 * 
 * POST /api/invoices/pay
 * Body: { invoiceIds: string[] }
 * 
 * Returns redirect URLs to QBO Bill Pay for each invoice that has a QBO bill created.
 * Also tags each bill with a unique batch ID for easy filtering in QBO.
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

    // Generate a unique batch payment ID for this payment session
    const batchId = generateBatchId();
    // Short batch code for DocNumber prefix (last 3 chars, e.g., "9PW")
    const shortBatchCode = batchId.slice(-3).toUpperCase();
    console.log('[PAYMENT] Generated batch ID:', batchId, '(short code:', shortBatchCode + ') for', invoiceIds.length, 'invoices');

    // Initialize QBO client for updating bills
    const qboClient = new QBOClient();
    await qboClient.initialize();

    const db = getDatabase();
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;
    let taggedCount = 0;
    
    // Payment lock timeout in milliseconds (10 minutes)
    const PAYMENT_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
    const now = new Date();
    const normalizedUserEmail = user.email.trim().toLowerCase();

    // First pass: Check for locked invoices and validate all invoices
    const invoicesToProcess: any[] = [];
    for (const invoiceId of invoiceIds) {
      // Find invoice (by id or invoice_number)
      let invoice = db.prepare('SELECT id, invoice_number, qbo_bill_id, status, vendor_name, amount_cents, payment_started_by, payment_started_at FROM invoices WHERE id = ?').get(invoiceId) as any;
      if (!invoice) {
        invoice = db.prepare('SELECT id, invoice_number, qbo_bill_id, status, vendor_name, amount_cents, payment_started_by, payment_started_at FROM invoices WHERE invoice_number = ?').get(invoiceId) as any;
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
      
      // Check for payment lock by another user
      if (invoice.payment_started_by && invoice.payment_started_at) {
        const lockEmail = invoice.payment_started_by.trim().toLowerCase();
        const lockTime = new Date(invoice.payment_started_at).getTime();
        const elapsed = now.getTime() - lockTime;
        
        // If locked by another user and within timeout, block
        if (lockEmail !== normalizedUserEmail && elapsed < PAYMENT_LOCK_TIMEOUT_MS) {
          const minutesAgo = Math.floor(elapsed / 60000);
          results.push({ 
            invoiceId: invoice.invoice_number || invoiceId, 
            ok: false, 
            error: `Payment in progress by ${invoice.payment_started_by} (started ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago)`,
            lockedBy: invoice.payment_started_by,
            lockedAt: invoice.payment_started_at,
          });
          errorCount++;
          continue;
        }
        // If lock expired or by same user, clear it and proceed
      }
      
      invoicesToProcess.push(invoice);
    }
    
    // Set payment locks for all valid invoices before processing
    const setLockStmt = db.prepare('UPDATE invoices SET payment_started_by = ?, payment_started_at = ? WHERE id = ?');
    for (const invoice of invoicesToProcess) {
      setLockStmt.run(normalizedUserEmail, now.toISOString(), invoice.id);
    }
    console.log('[PAYMENT] Set payment locks for', invoicesToProcess.length, 'invoices by', normalizedUserEmail);

    // Process each validated invoice
    for (const invoice of invoicesToProcess) {
      const invoiceId = invoice.id;
      try {

        // Tag the QBO bill with a batch code in DocNumber (Reference Number) for easy filtering
        let tagSuccess = false;
        try {
          const existingBill = await qboClient.getBillById(invoice.qbo_bill_id);
          if (existingBill && existingBill.SyncToken && existingBill.VendorRef) {
            
            // Prepend batch code to DocNumber (max 21 chars total in QBO)
            const currentDocNum = existingBill.DocNumber || '';
            // Only add prefix if not already present
            const newDocNum = currentDocNum.startsWith(shortBatchCode + '-') 
              ? currentDocNum 
              : `${shortBatchCode}-${currentDocNum}`.slice(0, 21);
            
            // Prepare the update payload - VendorRef is REQUIRED for QBO bill updates
            const updatePayload = {
              Id: existingBill.Id,
              SyncToken: existingBill.SyncToken,
              sparse: true,
              VendorRef: existingBill.VendorRef, // Required by QBO
              DocNumber: newDocNum, // Searchable as "Reference Number" in QBO!
            };

            await qboClient.updateBill(updatePayload);
            tagSuccess = true;
            taggedCount++;
            console.log('[PAYMENT] Tagged bill', invoice.qbo_bill_id, 'with batch code in DocNumber:', shortBatchCode, '-> new DocNumber:', newDocNum);
          } else if (existingBill) {
            console.warn('[PAYMENT] Bill found but missing SyncToken or VendorRef:', invoice.qbo_bill_id);
          }
        } catch (tagError: any) {
          console.warn('[PAYMENT] Failed to tag bill with batch code:', tagError?.message);
          // Don't fail the whole operation - just log the warning
        }

        // Build QBO Bill URLs
        const qboBillViewUrl = `${qboBaseUrl}/app/bill?txnId=${invoice.qbo_bill_id}`;
        const qboBillPayUrl = `${qboBaseUrl}/app/billpayment?txnId=${invoice.qbo_bill_id}`;

        results.push({
          invoiceId,
          invoiceNumber: invoice.invoice_number,
          vendorName: invoice.vendor_name,
          amount: invoice.amount_cents ? (invoice.amount_cents / 100).toFixed(2) : null,
          ok: true,
          qboBillId: invoice.qbo_bill_id,
          payUrl: qboBillViewUrl,
          viewUrl: qboBillViewUrl,
          billPaymentUrl: qboBillPayUrl,
          tagged: tagSuccess,
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

    // Build QBO search URL with batch ID filter
    // QBO search format: /app/bills with search parameter
    const qboSearchUrl = `${qboBaseUrl}/app/bills`;

    return json(200, {
      ok: true,
      successCount,
      errorCount,
      taggedCount,
      batchId, // Full batch ID for reference
      shortBatchCode, // Short code (3 chars) for QBO Reference Number search
      results,
      qboRealmId: realmId,
      qboBaseUrl,
      qboSearchUrl,
      message: successCount > 0 
        ? `Generated ${successCount} QBO Bill Pay URL(s). Bills tagged with batch ID: ${batchId}`
        : 'No valid invoices found for payment.',
    });
  } catch (error: any) {
    console.error('[PAYMENT] Unexpected error', { error: error?.message });
    return json(500, { ok: false, error: 'Payment processing failed' });
  }
}
