import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

    // Get vendor from query params
    const vendor = req.nextUrl.searchParams.get('vendor');
    if (!vendor) {
      return NextResponse.json(
        { ok: false, error: 'vendor parameter required' },
        { status: 400 }
      );
    }

    let allCharges: any[] = [];

    // Try to fetch from Stripe
    try {
      const charges = await stripe.charges.list({
        limit: 100,
        expand: ['data.refunds'],
      });
      allCharges = charges.data;
    } catch (stripeError: any) {
      console.warn('[STRIPE][PAYMENT_HISTORY] Stripe API error, checking for mock charges:', stripeError?.message);
      // Fall through to check for mock charges
    }

    // In test/development mode, also load mock charges from file
    const isTestMode = process.env.NODE_ENV === 'development' || process.env.STRIPE_TEST_MODE === 'true';
    if (isTestMode) {
      try {
        const dataDir = process.env.PCS_DATA_DIR || path.join(process.cwd(), 'pcs_ui_data');
        const mockChargesFile = path.join(dataDir, 'mock-stripe-charges.json');

        if (fs.existsSync(mockChargesFile)) {
          const mockChargesData = fs.readFileSync(mockChargesFile, 'utf-8');
          const mockCharges = JSON.parse(mockChargesData);
          console.log('[STRIPE][PAYMENT_HISTORY] Loaded mock charges from file');
          allCharges = [...allCharges, ...mockCharges];
        }
      } catch (mockError: any) {
        console.warn('[STRIPE][PAYMENT_HISTORY] Could not load mock charges:', mockError?.message);
      }
    }

    // Filter charges for this vendor
    // Charges can have metadata with vendor info, or we can match by description
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

