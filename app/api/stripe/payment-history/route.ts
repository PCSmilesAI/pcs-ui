import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get vendor from query params
    const vendor = req.nextUrl.searchParams.get('vendor');
    if (!vendor) {
      return NextResponse.json(
        { ok: false, error: 'vendor parameter required' },
        { status: 400 }
      );
    }

    let allCharges: any[] = [];

    // Try to fetch from Stripe if configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey) {
      try {
        console.log('[STRIPE][PAYMENT_HISTORY] Fetching charges from Stripe API...');
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const charges = await stripe.charges.list({
          limit: 100,
          expand: ['data.refunds'],
        });
        console.log('[STRIPE][PAYMENT_HISTORY] Got', charges.data.length, 'charges from Stripe');
        allCharges = charges.data;
      } catch (stripeError: any) {
        console.warn('[STRIPE][PAYMENT_HISTORY] Stripe API error:', stripeError?.message);
        // Fall through to check for mock charges
      }
    } else {
      console.log('[STRIPE][PAYMENT_HISTORY] Stripe not configured, will use mock charges if available');
    }

    // Load mock charges from file if it exists (for testing)
    // This works in both development and production if the file is present
    try {
      // Try multiple possible locations for the mock charges file
      const possiblePaths = [
        process.env.PCS_DATA_DIR ? path.join(process.env.PCS_DATA_DIR, 'mock-stripe-charges.json') : null,
        path.join(process.cwd(), 'pcs_ui_data', 'mock-stripe-charges.json'),
        '/var/www/pcs-ui-data/mock-stripe-charges.json',
        path.join(process.cwd(), '..', 'pcs-ui-data', 'mock-stripe-charges.json'),
      ].filter(Boolean) as string[];

      for (const mockChargesFile of possiblePaths) {
        if (fs.existsSync(mockChargesFile)) {
          const mockChargesData = fs.readFileSync(mockChargesFile, 'utf-8');
          const mockCharges = JSON.parse(mockChargesData);
          console.log('[STRIPE][PAYMENT_HISTORY] Loaded', mockCharges.length, 'mock charges from:', mockChargesFile);
          allCharges = [...allCharges, ...mockCharges];
          break;
        }
      }
    } catch (mockError: any) {
      console.warn('[STRIPE][PAYMENT_HISTORY] Could not load mock charges:', mockError?.message);
    }

    // Filter charges for this vendor
    // Charges can have metadata with vendor info, or we can match by description
    console.log('[STRIPE][PAYMENT_HISTORY] Total charges before filtering:', allCharges.length);
    const vendorCharges = allCharges.filter((charge) => {
      const metadata = charge.metadata || {};
      const chargeVendor = metadata.vendor || metadata.vendorName || '';
      const description = charge.description || '';

      // Match if vendor is in metadata or description
      return (
        chargeVendor.toLowerCase().includes(vendor.toLowerCase()) ||
        description.toLowerCase().includes(vendor.toLowerCase())
      );
    });
    console.log('[STRIPE][PAYMENT_HISTORY] Vendor charges after filtering:', vendorCharges.length);

    // Transform charges into payment history format
    const paymentHistory = vendorCharges
      .filter((charge) => charge.status === 'succeeded') // Only successful charges
      .map((charge) => ({
        id: charge.id,
        date: new Date(charge.created * 1000).toISOString(),
        amount: charge.amount / 100, // Convert from cents to dollars
        amountCents: charge.amount,
        status: charge.status,
        receiptUrl: charge.receipt_url,
        metadata: charge.metadata || {},
        invoiceIds: (charge.metadata?.invoiceIds || '').split(',').filter(Boolean),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      ok: true,
      vendor,
      paymentHistory,
      total: paymentHistory.length,
    });
  } catch (error: any) {
    console.error('[STRIPE][PAYMENT_HISTORY]', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}

