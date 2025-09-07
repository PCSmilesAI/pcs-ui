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

    // Clean, simple OAuth URL without extra parameters
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`;

    console.log('🔄 Clean OAuth URL:', authUrl);
    console.log('📊 Client ID:', clientId.substring(0, 8) + '...');
    console.log('📊 Redirect URI:', redirectUri);
    console.log('📊 Scopes:', scopes);

    return NextResponse.redirect(authUrl, 302);

  } catch (error: any) {
    console.error('❌ Clean OAuth Error:', error);
    return NextResponse.json({
      error: error.message,
      details: 'Failed to initiate clean QuickBooks OAuth'
    }, { status: 500 });
  }
}
