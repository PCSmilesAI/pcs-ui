import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json({ 
        error: 'Missing environment variables',
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        redirectUri: !!redirectUri
      }, { status: 500 });
    }

    // Test different OAuth URL formats that might work
    const oauthTests = [
      {
        name: 'Intuit OAuth (with client_secret)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&client_secret=${clientSecret}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=test123`
      },
      {
        name: 'Intuit OAuth (minimal)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`
      },
      {
        name: 'Intuit OAuth (with access_type)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      },
      {
        name: 'Intuit OAuth (with state)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=test123`
      },
      {
        name: 'Intuit OAuth (all parameters)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&client_secret=${clientSecret}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=test123`
      }
    ];

    return NextResponse.json({
      success: true,
      oauthTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        hasClientSecret: !!clientSecret
      },
      message: 'Test these OAuth URLs with different parameter combinations'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate OAuth test URLs'
    }, { status: 500 });
  }
}
