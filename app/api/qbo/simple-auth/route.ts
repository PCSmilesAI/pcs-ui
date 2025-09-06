import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Use the Intuit App Center OAuth endpoint (this one works based on our test)
    const state = 'secureRandomState123';
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`;

    return NextResponse.redirect(authUrl, 302);

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to redirect to OAuth'
    }, { status: 500 });
  }
}
