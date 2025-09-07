import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

type DebugInfo = {
  clientId: string;
  redirectUri: string;
  encodedRedirectUri: string;
  message: string;
  instructions: string[];
};

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    const debugInfo: DebugInfo = {
      clientId: clientId ? `${clientId.substring(0, 8)}...` : 'NOT SET',
      redirectUri: redirectUri || 'NOT SET',
      encodedRedirectUri: redirectUri ? encodeURIComponent(redirectUri) : 'NOT SET',
      message: 'Check your QuickBooks app configuration',
      instructions: [
        '1. Go to https://developer.intuit.com/app/developer/myapps',
        '2. Select your app',
        '3. Go to the "Keys" tab',
        '4. Check the "Redirect URIs" section',
        '5. Make sure it exactly matches the redirectUri above',
        '6. Common issues:',
        '   - Missing https://',
        '   - Missing trailing slash',
        '   - Wrong domain (localhost vs production)',
        '   - Case sensitivity'
      ]
    };
    
    return NextResponse.json(debugInfo);

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to debug redirect URI'
    }, { status: 500 });
  }
}
