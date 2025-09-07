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

    // Use the working format (no state parameter)
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`;

    return NextResponse.redirect(authUrl, 302);

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to initiate QuickBooks OAuth'
    }, { status: 500 });
  }
}
