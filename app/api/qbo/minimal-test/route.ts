import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test with minimal parameters
    const minimalUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    // Test with different scope formats
    const scopes = [
      'com.intuit.quickbooks.accounting',
      'accounting',
      'com.intuit.quickbooks.accounting,com.intuit.quickbooks.payment',
      'openid profile email accounting'
    ];

    const testUrls = scopes.map(scope => ({
      scope,
      url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`
    }));

    return NextResponse.json({
      success: true,
      minimalUrl,
      testUrls,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        clientIdLength: clientId.length
      },
      message: 'Try these minimal OAuth URLs to identify the issue'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate test URLs'
    }, { status: 500 });
  }
}
