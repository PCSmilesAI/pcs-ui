import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stripe/connect
 * 
 * Unlike QuickBooks which requires OAuth, Stripe Connect uses API keys.
 * This endpoint checks if Stripe is properly configured and either:
 * 1. Redirects to Stripe Dashboard if connected
 * 2. Returns instructions if not configured
 */
export async function GET(req: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      // Stripe is not configured - show configuration instructions
      console.warn('[STRIPE][CONNECT] Missing STRIPE_SECRET_KEY');
      
      // Return an HTML page with instructions
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Stripe Configuration Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #1f2937; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .steps { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { margin: 8px 0; }
    code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
    a { color: #2563eb; }
    .back-btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #357ab2; color: white; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Stripe Configuration Required</h1>
  
  <div class="warning">
    <strong>⚠️ Stripe API key is not configured</strong>
    <p>Unlike QuickBooks, Stripe uses API keys instead of OAuth. You need to configure the API key on the server.</p>
  </div>
  
  <div class="steps">
    <h3>Configuration Steps:</h3>
    <ol>
      <li>Go to <a href="https://dashboard.stripe.com/apikeys" target="_blank">Stripe Dashboard → API Keys</a></li>
      <li>Copy your <strong>Secret key</strong> (starts with <code>sk_live_</code> or <code>sk_test_</code>)</li>
      <li>Add to your server environment: <code>STRIPE_SECRET_KEY=sk_...</code></li>
      <li>Restart the server</li>
    </ol>
  </div>
  
  <p>For webhook support, also configure:</p>
  <ul>
    <li><code>PCS_STRIPE_WEBHOOK_SECRET</code> - Get from Stripe Dashboard → Webhooks</li>
  </ul>
  
  <a href="/ConnectionsPage" class="back-btn">← Back to Connections</a>
</body>
</html>
      `;
      
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Stripe key exists - verify it works
    try {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
      const account = await stripe.accounts.retrieve();
      
      console.log('[STRIPE][CONNECT] Connection verified', { 
        accountId: account.id, 
        type: account.type 
      });
      
      // Stripe is connected - redirect to Stripe Dashboard
      // Use the specific dashboard URL for the account
      const dashboardUrl = 'https://dashboard.stripe.com';
      
      // Return success HTML with redirect option
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Stripe Connected</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #065f46; }
    .success { background: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .info { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0; }
    code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
    a { color: #2563eb; }
    .btn { display: inline-block; margin-top: 10px; margin-right: 10px; padding: 10px 20px; background: #357ab2; color: white; text-decoration: none; border-radius: 6px; }
    .btn-secondary { background: #6b7280; }
  </style>
</head>
<body>
  <h1>✅ Stripe Connected</h1>
  
  <div class="success">
    <strong>Stripe is properly configured and connected!</strong>
    <p>Account ID: <code>${account.id}</code></p>
    <p>Account Type: <code>${account.type || 'standard'}</code></p>
  </div>
  
  <div class="info">
    <h3>Account Status:</h3>
    <ul>
      <li>Charges Enabled: ${account.charges_enabled ? '✅ Yes' : '❌ No'}</li>
      <li>Payouts Enabled: ${account.payouts_enabled ? '✅ Yes' : '❌ No'}</li>
    </ul>
  </div>
  
  <a href="${dashboardUrl}" target="_blank" class="btn">Open Stripe Dashboard →</a>
  <a href="/ConnectionsPage" class="btn btn-secondary">← Back to Connections</a>
</body>
</html>
      `;
      
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      
    } catch (stripeError: any) {
      console.error('[STRIPE][CONNECT] API verification failed:', stripeError?.message);
      
      // Key exists but doesn't work
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Stripe Connection Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #991b1b; }
    .error { background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .steps { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0; }
    code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
    a { color: #2563eb; }
    .back-btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #357ab2; color: white; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>❌ Stripe Connection Error</h1>
  
  <div class="error">
    <strong>The Stripe API key is configured but verification failed.</strong>
    <p>This usually means the API key is invalid or expired.</p>
  </div>
  
  <div class="steps">
    <h3>Troubleshooting Steps:</h3>
    <ol>
      <li>Go to <a href="https://dashboard.stripe.com/apikeys" target="_blank">Stripe Dashboard → API Keys</a></li>
      <li>Verify the secret key is correct and active</li>
      <li>If using test mode, ensure you're using a test key (<code>sk_test_...</code>)</li>
      <li>Update the <code>STRIPE_SECRET_KEY</code> environment variable</li>
      <li>Restart the server</li>
    </ol>
  </div>
  
  <a href="/ConnectionsPage" class="back-btn">← Back to Connections</a>
</body>
</html>
      `;
      
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    
  } catch (error: any) {
    console.error('[STRIPE][CONNECT] Unexpected error:', error?.message);
    return NextResponse.json(
      { ok: false, error: 'Failed to check Stripe connection' },
      { status: 500 }
    );
  }
}


