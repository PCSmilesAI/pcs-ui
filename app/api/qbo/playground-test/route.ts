import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test the exact format that Intuit's OAuth playground uses
    const playgroundTests = [
      {
        name: 'Intuit OAuth Playground Format',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=playground-test-123`
      },
      {
        name: 'With additional parameters',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=playground-test-123&prompt=consent`
      },
      {
        name: 'With different parameter order',
        url: `https://appcenter.intuit.com/connect/oauth2?state=playground-test-123&client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`
      }
    ];

    return NextResponse.json({
      success: true,
      playgroundTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri
      },
      message: 'Test these URLs that match Intuit OAuth playground format'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate playground test URLs'
    }, { status: 500 });
  }
}
