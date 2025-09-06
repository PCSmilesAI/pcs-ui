import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Try the Intuit OAuth URL format from their documentation
    const state = 'test-state-123';
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`;

    // Test if we can reach the OAuth endpoint
    try {
      const response = await fetch(authUrl, {
        method: 'HEAD', // Just check if the endpoint exists
        headers: {
          'User-Agent': 'PCS-AI-Test/1.0'
        }
      });

      return NextResponse.json({
        success: true,
        authUrl,
        responseStatus: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        environment: {
          clientId: clientId.substring(0, 10) + '...',
          redirectUri,
          scopes,
          state
        },
        message: 'OAuth URL test completed'
      });

    } catch (fetchError: any) {
      return NextResponse.json({
        success: false,
        authUrl,
        fetchError: fetchError.message,
        environment: {
          clientId: clientId.substring(0, 10) + '...',
          redirectUri,
          scopes,
          state
        }
      });
    }

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test OAuth'
    }, { status: 500 });
  }
}
