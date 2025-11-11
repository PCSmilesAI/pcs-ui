import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import crypto from 'crypto';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { getById, save } from '../../../../lib/workflow/invoiceStore';
import { isAdmin } from '../../../../lib/workflow/rolesStore';
import { loadMap, findVendorKey } from '../../../../lib/payments/vendorStore';
import { generateRemittancePDF, sendRemittanceEmail, RemittanceData } from '../../../../lib/payments/remittanceService';
import { rateLimitByUser } from '../../../../lib/ratelimit/rateLimiter';

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

  // Apply rate limiting per user (100 payment requests per minute)
  const rateLimitResult = rateLimitByUser(user.email, { maxRequests: 100, windowSeconds: 60 });
  if (!rateLimitResult.allowed) {
    console.warn('[API][INVOICES][PAY]', 'rate_limit_exceeded', { userEmail: user.email });
    return json(429, { ok: false, error: 'Too many requests' });
  }

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

    // Track invoices by vendor for remittance emails
    const invoicesByVendor: Record<string, any[]> = {};

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
          results.push({ invoiceId, ok: false, error: 'Vendor information missing' });
          errorCount++;
          continue;
        }

        const vendorKey = findVendorKey(vendorMap, vendorName);
        if (!vendorKey) {
          results.push({ invoiceId, ok: false, error: 'Vendor not found' });
          errorCount++;
          continue;
        }

        const vendorEntry = vendorMap.vendors[vendorKey];
        if (!vendorEntry?.stripeAccountId) {
          results.push({ invoiceId, ok: false, error: 'Vendor payment account not configured' });
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
          results.push({ invoiceId, ok: false, error: 'Invalid invoice amount' });
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
          // SECURITY: Use cryptographically secure random bytes for test transfer ID
          const randomSuffix = crypto.randomBytes(4).toString('hex');
          transfer = {
            id: `tr_test_${Date.now()}_${randomSuffix}`,
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

        // Track for remittance email
        if (!invoicesByVendor[vendorKey]) {
          invoicesByVendor[vendorKey] = [];
        }
        invoicesByVendor[vendorKey].push({
          invoiceId,
          invoice,
          amount: amountNumber,
          transferId: transfer.id,
          vendorEntry,
        });

        results.push({
          invoiceId,
          ok: true,
          transferId: transfer.id,
          amount: amountNumber,
        });
        successCount++;
      } catch (err: any) {
        // Log full error server-side only
        console.error('[PAYMENT] Error processing invoice', {
          invoiceId,
          error: err?.message,
        });
        // Return safe error message to client
        results.push({
          invoiceId,
          ok: false,
          error: 'Payment processing failed',
        });
        errorCount++;
      }
    }

    // Send remittance emails for each vendor
    const remittanceResults: any[] = [];
    for (const [vendorKey, paidInvoices] of Object.entries(invoicesByVendor)) {
      try {
        const vendorEntry = vendorMap.vendors[vendorKey];
        const vendorEmail = vendorEntry?.email;

        if (!vendorEmail) {
          console.warn('[REMITTANCE] No email configured for vendor', { vendorKey });
          remittanceResults.push({
            vendor: vendorKey,
            ok: false,
            error: 'No email configured for vendor',
          });
          continue;
        }

        // Calculate totals
        const totalAmount = paidInvoices.reduce((sum, p) => sum + p.amount, 0);
        const remittanceInvoices = paidInvoices.map((p) => ({
          invoiceNumber: p.invoice.invoice_number || p.invoice.invoice || p.invoiceId,
          amount: p.amount,
          dueDate: p.invoice.due_date || p.invoice.dueDate || 'N/A',
        }));

        // Generate PDF
        const remittanceData: RemittanceData = {
          vendorName: vendorKey,
          vendorEmail,
          totalAmount,
          paymentDate: new Date().toLocaleDateString(),
          invoices: remittanceInvoices,
          transferId: paidInvoices[0].transferId,
          companyName: process.env.COMPANY_NAME || 'Pacific Crest Smiles',
        };

        console.log('[REMITTANCE] Generating PDF', { vendor: vendorKey, invoiceCount: paidInvoices.length });
        const pdfBuffer = await generateRemittancePDF(remittanceData);

        // Send email
        console.log('[REMITTANCE] Sending email', { vendor: vendorKey, email: vendorEmail });
        const emailResult = await sendRemittanceEmail(remittanceData, pdfBuffer);

        if (emailResult.ok) {
          console.log('[REMITTANCE] Email sent successfully', {
            vendor: vendorKey,
            provider: emailResult.provider,
          });
          remittanceResults.push({
            vendor: vendorKey,
            ok: true,
            provider: emailResult.provider,
            invoiceCount: paidInvoices.length,
            totalAmount,
          });
        } else {
          console.warn('[REMITTANCE] Email send failed', {
            vendor: vendorKey,
            error: emailResult.error,
          });
          remittanceResults.push({
            vendor: vendorKey,
            ok: false,
            error: emailResult.error,
          });
        }
      } catch (err: any) {
        // Log full error server-side only
        console.error('[REMITTANCE] Error sending remittance email', {
          vendor: vendorKey,
          error: err?.message,
        });
        // Return safe error message to client
        remittanceResults.push({
          vendor: vendorKey,
          ok: false,
          error: 'Failed to send remittance email',
        });
      }
    }

    return json(200, {
      ok: true,
      successCount,
      errorCount,
      results,
      remittance: remittanceResults,
    });
  } catch (error: any) {
    // Log full error server-side only
    console.error('[PAYMENT] Unexpected error', { error: error?.message });
    // Return safe error message to client
    return json(500, { ok: false, error: 'Payment processing failed' });
  }
}

