import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

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

    // Test different URL construction methods
    const methods = {
      method1: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`,
      
      method2: new URL('https://appcenter.intuit.com/connect/oauth2').toString() + 
        `?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline`,
      
      method3: `https://appcenter.intuit.com/connect/oauth2?` + 
        `client_id=${clientId}&` +
        `scope=${scopes}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `access_type=offline`
    };

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      redirectUri: redirectUri,
      encodedRedirectUri: encodeURIComponent(redirectUri),
      scopes: scopes,
      testUrls: methods,
      analysis: {
        redirectUriLength: redirectUri.length,
        encodedLength: encodeURIComponent(redirectUri).length,
        hasHttps: redirectUri.startsWith('https://'),
        hasTrailingSlash: redirectUri.endsWith('/'),
        isValidUrl: (() => {
          try {
            new URL(redirectUri);
            return true;
          } catch {
            return false;
          }
        })()
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test OAuth URL construction'
    }, { status: 500 });
  }
}
