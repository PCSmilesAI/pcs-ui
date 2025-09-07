import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different redirect URI variations
    const redirectUriVariations = [
      'https://pcsmilesai.com/api/qbo/callback',
      'https://pcsmilesai.com/api/qbo/callback/',
      'https://www.pcsmilesai.com/api/qbo/callback',
      'https://www.pcsmilesai.com/api/qbo/callback/',
      'https://pcsmilesai.com/api/qbo/callback?',
      'https://pcsmilesai.com/api/qbo/callback#',
    ];

    const testUrls = redirectUriVariations.map((uri, index) => ({
      variation: index + 1,
      redirectUri: uri,
      encoded: encodeURIComponent(uri),
      oauthUrl: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(uri)}&response_type=code&access_type=offline`
    }));

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      scopes: scopes,
      qboEnv: process.env.QBO_ENV,
      testUrls: testUrls,
      instructions: [
        '1. Try each variation above to see which one works',
        '2. The most common working formats are:',
        '   - https://pcsmilesai.com/api/qbo/callback',
        '   - https://pcsmilesai.com/api/qbo/callback/',
        '   - https://www.pcsmilesai.com/api/qbo/callback',
        '3. Make sure your Intuit Developer Dashboard has the EXACT same URI',
        '4. Check for any trailing slashes or www prefixes',
        '5. If none work, there might be an issue with your app configuration'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test redirect URI variations'
    }, { status: 500 });
  }
}
