import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different environment configurations
    const environmentTests = [
      {
        name: 'Development Environment (current)',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=dev-test-123`
      },
      {
        name: 'Production Environment',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=prod-test-123`
      },
      {
        name: 'Sandbox Environment',
        url: `https://sandbox-quickbooks.api.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=sandbox-test-123`
      },
      {
        name: 'Platform OAuth (Production)',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=platform-test-123`
      }
    ];

    return NextResponse.json({
      success: true,
      environmentTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        currentEnv: process.env.NODE_ENV || 'development'
      },
      message: 'Test these URLs across different environments'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate environment test URLs'
    }, { status: 500 });
  }
}
