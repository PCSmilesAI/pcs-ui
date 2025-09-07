import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    const env = process.env.QBO_ENV;
    
    // Create the actual OAuth URL that would be generated
    const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri || '')}&response_type=code&access_type=offline`;
    
    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: clientId ? `${clientId.substring(0, 8)}...` : 'NOT SET',
      redirectUri: redirectUri || 'NOT SET',
      scopes: scopes || 'NOT SET',
      qboEnv: env || 'NOT SET',
      encodedRedirectUri: redirectUri ? encodeURIComponent(redirectUri) : 'NOT SET',
      generatedAuthUrl: authUrl,
      instructions: [
        '1. Copy the redirectUri value above',
        '2. Go to https://developer.intuit.com/app/developer/myapps',
        '3. Select your app → Keys tab',
        '4. Check if the Redirect URIs section contains the EXACT same value',
        '5. If not, add it or update the existing one to match exactly',
        '6. Common mismatches:',
        '   - Missing https://',
        '   - Missing trailing slash /',
        '   - Wrong domain (localhost vs production)',
        '   - Case sensitivity',
        '   - Extra spaces or characters'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to debug environment variables'
    }, { status: 500 });
  }
}
