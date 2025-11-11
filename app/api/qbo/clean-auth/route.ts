import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      // Log full error server-side only
      console.error('[QBO][CLEAN_AUTH] Missing environment variables');
      // Return safe error message to client
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    // Clean, simple OAuth URL with required state parameter
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const authUrl = `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`;

    console.log('🔄 Clean OAuth URL:', authUrl);
    console.log('📊 Client ID:', clientId.substring(0, 8) + '...');
    console.log('📊 Redirect URI:', redirectUri);
    console.log('📊 Scopes:', scopes);

    return NextResponse.redirect(authUrl, 302);

  } catch (error: any) {
    // Log full error server-side only
    console.error('❌ Clean OAuth Error:', error);
    // Return safe error message to client
    return NextResponse.json({
      error: 'Failed to initiate OAuth'
    }, { status: 500 });
  }
}
