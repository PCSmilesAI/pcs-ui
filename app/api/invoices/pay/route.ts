import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getById, save } from '../../../../lib/workflow/invoiceStore';
import { isAdmin } from '../../../../lib/workflow/rolesStore';
import { loadMap, findVendorKey } from '../../../../lib/payments/vendorStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req);

  try {
    // Only admins can process payments
    const allowed = await isAdmin(user.email);
    if (!allowed) {
      return json(403, { ok: false, error: 'Unauthorized' });
    }

    const body = await req.json();
    const invoiceIds = Array.isArray(body?.invoiceIds) ? body.invoiceIds : [body?.invoiceId];
    
    if (!invoiceIds || invoiceIds.length === 0) {
      return json(400, { ok: false, error: 'invoiceIds required' });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      console.error('[PAYMENT] Missing STRIPE_SECRET_KEY');
      return json(500, { ok: false, error: 'Stripe not configured' });
    }

    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });
    const vendorMap = await loadMap();

    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const invoiceId of invoiceIds) {
      try {
        const invoice = await getById(String(invoiceId));
        if (!invoice) {
          results.push({ invoiceId, ok: false, error: 'Invoice not found' });
          errorCount++;
          continue;
        }

        // Get vendor name and Stripe account
        const vendorName = invoice.vendor || invoice.vendor_name;
        if (!vendorName) {
          results.push({ invoiceId, ok: false, error: 'Vendor name not found' });
          errorCount++;
          continue;
        }

        const vendorKey = findVendorKey(vendorMap, vendorName);
        if (!vendorKey) {
          results.push({ invoiceId, ok: false, error: `Vendor "${vendorName}" not found in system` });
          errorCount++;
          continue;
        }

        const vendorEntry = vendorMap.vendors[vendorKey];
        if (!vendorEntry?.stripeAccountId) {
          results.push({ invoiceId, ok: false, error: `Vendor "${vendorName}" has no Stripe account` });
          errorCount++;
          continue;
        }

        // Get amount
        const amountStr = invoice.total || invoice.amount || invoice.invoice_total;
        if (!amountStr) {
          results.push({ invoiceId, ok: false, error: 'Invoice amount not found' });
          errorCount++;
          continue;
        }

        const amountNumber = typeof amountStr === 'string' 
          ? parseFloat(amountStr.replace(/[^0-9.\-]/g, ''))
          : amountStr;
        
        if (isNaN(amountNumber) || amountNumber <= 0) {
          results.push({ invoiceId, ok: false, error: `Invalid amount: ${amountStr}` });
          errorCount++;
          continue;
        }

        const amountCents = Math.round(amountNumber * 100);

        // Create Stripe transfer to vendor's connected account
        console.log('[PAYMENT] Creating transfer', {
          invoiceId,
          vendor: vendorName,
          amount: amountNumber,
          stripeAccount: vendorEntry.stripeAccountId,
        });

        let transfer: any;
        const testMode = process.env.STRIPE_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';

        if (testMode) {
          // In test mode, create a mock transfer object
          console.log('[PAYMENT] Test mode: Creating mock transfer');
          transfer = {
            id: `tr_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            object: 'transfer',
            amount: amountCents,
            currency: 'usd',
            destination: vendorEntry.stripeAccountId,
            created: Math.floor(Date.now() / 1000),
            metadata: {
              invoiceId: String(invoiceId),
              invoiceNumber: invoice.invoice_number || invoice.invoice || invoiceId,
              vendor: vendorName,
              paidBy: user.email,
              testMode: true,
            },
          };
        } else {
          transfer = await stripe.transfers.create({
            amount: amountCents,
            currency: 'usd',
            destination: vendorEntry.stripeAccountId,
            metadata: {
              invoiceId: String(invoiceId),
              invoiceNumber: invoice.invoice_number || invoice.invoice || invoiceId,
              vendor: vendorName,
              paidBy: user.email,
            },
            description: `Payment for invoice ${invoice.invoice_number || invoiceId}`,
          });
        }

        console.log('[PAYMENT] Transfer created', {
          invoiceId,
          transferId: transfer.id,
          amount: amountNumber,
          testMode,
        });

        // Mark invoice as paid with Stripe transfer ID
        invoice.status = 'paid';
        invoice.paid_at = new Date().toISOString();
        invoice.paid_by = user.email;
        invoice.stripe_transfer_id = transfer.id;
        
        await save(invoice);

        results.push({
          invoiceId,
          ok: true,
          transferId: transfer.id,
          amount: amountNumber,
        });
        successCount++;
      } catch (err: any) {
        console.error('[PAYMENT] Error processing invoice', {
          invoiceId,
          error: err?.message,
        });
        results.push({
          invoiceId,
          ok: false,
          error: err?.message || 'Payment processing failed',
        });
        errorCount++;
      }
    }

    return json(200, {
      ok: true,
      successCount,
      errorCount,
      results,
    });
  } catch (error: any) {
    console.error('[PAYMENT] Unexpected error', { error: error?.message });
    return json(500, { ok: false, error: error?.message || 'Unexpected error' });
  }
}

