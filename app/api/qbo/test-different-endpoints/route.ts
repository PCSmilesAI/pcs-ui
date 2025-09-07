import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different OAuth endpoints
    const endpoints = {
      appcenter: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`,
      
      platform: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`,
      
      sandbox: `https://sandbox-quickbooks.api.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`,
      
      production: `https://quickbooks.api.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
    };

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      redirectUri: redirectUri,
      encodedRedirectUri: encodeURIComponent(redirectUri),
      scopes: scopes,
      qboEnv: process.env.QBO_ENV,
      testEndpoints: endpoints,
      instructions: [
        '1. Try each endpoint above to see which one works',
        '2. The appcenter endpoint is what we\'ve been using',
        '3. If appcenter fails, try platform or sandbox',
        '4. Make sure you\'re using the right environment (sandbox vs production)',
        '5. Check if your app is configured for sandbox or production in Intuit dashboard'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test different endpoints'
    }, { status: 500 });
  }
}
