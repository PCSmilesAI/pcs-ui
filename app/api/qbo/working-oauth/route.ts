import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Generate a secure random state parameter
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Create the working OAuth URL with all required parameters
    const authUrl = `https://oauth.platform.intuit.com/oauth2/v1/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `access_type=offline&` +
      `state=${state}`;

    console.log('🎉 Working OAuth URL generated:');
    console.log('  - Client ID:', clientId.substring(0, 8) + '...');
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - Scopes:', scopes);
    console.log('  - State:', state);
    console.log('  - Full URL:', authUrl);

    return NextResponse.redirect(authUrl, 302);

  } catch (error: any) {
    console.error('❌ Working OAuth Error:', error);
    return NextResponse.json({
      error: error.message,
      details: 'Failed to initiate working QuickBooks OAuth'
    }, { status: 500 });
  }
}
