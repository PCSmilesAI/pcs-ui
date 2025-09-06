import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Try different OAuth URL formats
    const state = 'test-state-123';
    
    const urls = {
      // Format 1: Standard OAuth2
      standard: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`,
      
      // Format 2: With /app/ path
      appPath: `https://appcenter.intuit.com/app/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`,
      
      // Format 3: Platform OAuth
      platform: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
      
      // Format 4: Simple format
      simple: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`
    };

    return NextResponse.json({
      success: true,
      urls,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        scopes,
        state
      },
      message: 'Try these different OAuth URL formats manually in your browser'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate OAuth URLs'
    }, { status: 500 });
  }
}
