import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test with different OAuth library approaches
    const libraryTests = [
      {
        name: 'Intuit OAuth Library (node-quickbooks)',
        description: 'Using node-quickbooks library format',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=library-test-123`
      },
      {
        name: 'Simple OAuth2 Library',
        description: 'Using simple-oauth2 library format',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=simple-oauth2-test`
      },
      {
        name: 'Manual URL Construction',
        description: 'Manually constructed URL with exact parameter order',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=manual-test-456`
      }
    ];

    return NextResponse.json({
      success: true,
      libraryTests,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        hasClientSecret: !!clientSecret
      },
      message: 'Test these URLs using different OAuth library approaches'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate library test URLs'
    }, { status: 500 });
  }
}
