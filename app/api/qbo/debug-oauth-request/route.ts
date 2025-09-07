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

    // Test different encoding methods
    const encodedRedirectUri1 = encodeURIComponent(redirectUri);
    const encodedRedirectUri2 = encodeURI(redirectUri);
    const encodedRedirectUri3 = redirectUri.replace(/:/g, '%3A').replace(/\//g, '%2F');
    
    // Test different OAuth URLs
    const oauthUrls = {
      appcenter_simple: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodedRedirectUri1}&response_type=code&access_type=offline`,
      
      appcenter_manual: `https://appcenter.intuit.com/connect/oauth2?` +
        `client_id=${clientId}&` +
        `scope=${scopes}&` +
        `redirect_uri=${encodedRedirectUri1}&` +
        `response_type=code&` +
        `access_type=offline`,
      
      platform: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodedRedirectUri1}&response_type=code&access_type=offline`,
      
      production: `https://quickbooks.api.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodedRedirectUri1}&response_type=code&access_type=offline`
    };

    // Detailed analysis
    const analysis = {
      originalRedirectUri: redirectUri,
      length: redirectUri.length,
      characters: redirectUri.split('').map((char, i) => ({ char, code: char.charCodeAt(0), position: i })),
      encoded1: encodedRedirectUri1,
      encoded2: encodedRedirectUri2,
      encoded3: encodedRedirectUri3,
      isValidUrl: (() => {
        try {
          new URL(redirectUri);
          return true;
        } catch {
          return false;
        }
      })(),
      hasHttps: redirectUri.startsWith('https://'),
      hasTrailingSlash: redirectUri.endsWith('/'),
      domain: redirectUri.replace('https://', '').split('/')[0],
      path: redirectUri.replace('https://', '').split('/').slice(1).join('/')
    };

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      redirectUri: redirectUri,
      scopes: scopes,
      qboEnv: process.env.QBO_ENV,
      analysis: analysis,
      oauthUrls: oauthUrls,
      instructions: [
        '1. Check the analysis section for any issues with the redirect URI',
        '2. Try each OAuth URL to see which one works',
        '3. Look for any character encoding issues',
        '4. Verify the domain and path are correct',
        '5. Make sure there are no hidden characters or spaces'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to debug OAuth request'
    }, { status: 500 });
  }
}
