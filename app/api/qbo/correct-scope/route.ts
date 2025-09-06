import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Use the exact scope that's enabled in your app
    const scope = 'com.intuit.quickbooks.accounting';
    
    // Test different URL formats
    const testUrls = [
      {
        name: 'Standard format',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`
      },
      {
        name: 'With access_type',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'With state parameter',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=test123`
      },
      {
        name: 'With both access_type and state',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=test123`
      },
      {
        name: 'URL encoded scope',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`
      }
    ];

    return NextResponse.json({
      success: true,
      enabledScope: scope,
      testUrls,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri
      },
      message: 'Test these URLs with the correct scope that is enabled in your app'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate test URLs'
    }, { status: 500 });
  }
}
