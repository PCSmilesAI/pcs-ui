import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({
        error: 'Missing environment variables',
        clientId: !!clientId,
        redirectUri: !!redirectUri,
        scopes: !!scopes
      }, { status: 500 });
    }

    // Generate the OAuth URL manually to test
    const authUrl = new URL('https://oauth.platform.intuit.com/oauth2/v1/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', 'test-state-123');

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        scopes
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate OAuth URL'
    }, { status: 500 });
  }
}
