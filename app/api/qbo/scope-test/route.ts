import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different scope combinations
    const scopeTests = [
      {
        name: 'No scope (let QB choose)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Just "accounting"',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Just "openid"',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=openid&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'openid + accounting',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=openid accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'openid + profile + accounting',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=openid profile accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Full Intuit scope',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      }
    ];

    return NextResponse.json({
      success: true,
      scopeTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri
      },
      message: 'Test these URLs to find the correct scope format'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate scope test URLs'
    }, { status: 500 });
  }
}