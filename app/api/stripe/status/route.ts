import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 Stripe Status API called');
    
    // Check if Stripe environment variables are configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!stripeSecretKey) {
      return NextResponse.json({
        connected: false,
        message: 'Stripe secret key not configured',
        error: 'STRIPE_SECRET_KEY environment variable is missing',
        debug: {
          timestamp: new Date().toISOString(),
          hasSecretKey: false,
          hasWebhookSecret: !!stripeWebhookSecret,
        }
      });
    }

    // Try to make a simple API call to verify the connection
    try {
      const stripe = require('stripe')(stripeSecretKey);
      
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
      console.error('Stripe API error:', stripeError);
      return NextResponse.json({
        connected: false,
        message: 'Stripe API connection failed',
        error: stripeError.message || 'Failed to connect to Stripe API',
        debug: {
          timestamp: new Date().toISOString(),
          hasSecretKey: true,
          hasWebhookSecret: !!stripeWebhookSecret,
          stripeError: stripeError.toString(),
        }
      });
    }

  } catch (error: any) {
    console.error('Stripe status check error:', error);
    return NextResponse.json({
      connected: false,
      error: error.message || 'Failed to check Stripe status',
      debug: {
        timestamp: new Date().toISOString(),
        error: error.toString()
      }
    }, { status: 500 });
  }
}
