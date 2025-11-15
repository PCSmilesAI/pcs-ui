import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

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

    // Fetch all charges from Stripe
    // Filter by metadata.vendor if available, or by description
    const charges = await stripe.charges.list({
      limit: 100,
      expand: ['data.refunds'],
    });

    // Filter charges for this vendor
    // Charges can have metadata with vendor info, or we can match by description
    const vendorCharges = charges.data.filter((charge) => {
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

