import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Use the working Platform endpoint with state parameter
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const authUrl = `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`;

    return NextResponse.redirect(authUrl, 302);

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to initiate QuickBooks OAuth'
    }, { status: 500 });
  }
}
