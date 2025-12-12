import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 Stripe Status API called');
    
    // Check if Stripe environment variables are configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    // Use consistent env var name: PCS_STRIPE_WEBHOOK_SECRET
    const stripeWebhookSecret = process.env.PCS_STRIPE_WEBHOOK_SECRET;
    
    if (!stripeSecretKey) {
      // Log full error server-side only
      console.warn('[STRIPE][STATUS] Missing STRIPE_SECRET_KEY');
      // Return safe error message to client
      return NextResponse.json({
        connected: false,
        message: 'Stripe not configured',
        debug: {
          timestamp: new Date().toISOString(),
        }
      });
    }

    // Try to make a simple API call to verify the connection
    try {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
      
      // Make a simple API call to check if the key is valid
      const account = await stripe.accounts.retrieve();
      
      return NextResponse.json({
        connected: true,
        message: `Connected to Stripe (${account.id})`,
        accountId: account.id,
        country: account.country,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        debug: {
          timestamp: new Date().toISOString(),
          hasSecretKey: true,
          hasWebhookSecret: !!stripeWebhookSecret,
          accountType: account.type,
        }
      });
    } catch (stripeError: any) {
      // Log full error server-side only
      console.error('[STRIPE][STATUS] Stripe API error:', stripeError?.message);
      // Return safe error message to client
      return NextResponse.json({
        connected: false,
        message: 'Stripe API connection failed',
        debug: {
          timestamp: new Date().toISOString(),
        }
      });
    }

  } catch (error: any) {
    // Log full error server-side only
    console.error('[STRIPE][STATUS] Status check error:', error?.message);
    // Return safe error message to client
    return NextResponse.json({
      connected: false,
      message: 'Status check failed',
      debug: {
        timestamp: new Date().toISOString(),
      }
    }, { status: 500 });
  }
}
