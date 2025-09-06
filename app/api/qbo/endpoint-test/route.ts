import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different OAuth endpoints
    const endpointTests = [
      {
        name: 'Intuit App Center (current)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Platform OAuth (production)',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Platform OAuth (sandbox)',
        url: `https://sandbox-quickbooks.api.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Intuit OAuth (alternative)',
        url: `https://oauth.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'QuickBooks OAuth (direct)',
        url: `https://quickbooks.api.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      }
    ];

    return NextResponse.json({
      success: true,
      endpointTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri
      },
      message: 'Test these different OAuth endpoints to see which one works'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate endpoint test URLs'
    }, { status: 500 });
  }
}
