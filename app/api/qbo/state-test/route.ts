import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scope = 'com.intuit.quickbooks.accounting';
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different state parameter formats
    const stateTests = [
      {
        name: 'Simple state',
        state: 'test123',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=test123`
      },
      {
        name: 'UUID-like state',
        state: '12345678-1234-1234-1234-123456789012',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=12345678-1234-1234-1234-123456789012`
      },
      {
        name: 'Random state',
        state: 'randomState123',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=randomState123`
      },
      {
        name: 'URL encoded state',
        state: 'test%20123',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent('test 123')}`
      },
      {
        name: 'State with access_type',
        state: 'test123',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=test123`
      },
      {
        name: 'State with different order',
        state: 'test123',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&state=test123&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`
      },
      {
        name: 'State at the end',
        state: 'test123',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=test123`
      }
    ];

    return NextResponse.json({
      success: true,
      stateTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        scope
      },
      message: 'Test these different state parameter formats to find the one that works'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate state test URLs'
    }, { status: 500 });
  }
}
