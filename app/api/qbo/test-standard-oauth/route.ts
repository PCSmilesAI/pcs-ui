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

    // Test different OAuth 2.0 parameter combinations
    const oauthTests = {
      // Standard OAuth 2.0 parameters
      standard: {
        name: 'Standard OAuth 2.0',
        url: `https://appcenter.intuit.com/connect/oauth2?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `access_type=offline`,
        description: 'Basic OAuth 2.0 parameters'
      },

      // With state parameter
      with_state: {
        name: 'With State Parameter',
        url: `https://appcenter.intuit.com/connect/oauth2?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `state=test_state_123&` +
          `access_type=offline`,
        description: 'OAuth 2.0 with state parameter for security'
      },

      // With PKCE (Proof Key for Code Exchange)
      with_pkce: {
        name: 'With PKCE',
        url: `https://appcenter.intuit.com/connect/oauth2?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `code_challenge=test_challenge&` +
          `code_challenge_method=S256&` +
          `access_type=offline`,
        description: 'OAuth 2.0 with PKCE for enhanced security'
      },

      // Different endpoint - platform.intuit.com
      platform_endpoint: {
        name: 'Platform Endpoint',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `access_type=offline`,
        description: 'Using oauth.platform.intuit.com endpoint'
      },

      // Different endpoint - quickbooks.api.intuit.com
      quickbooks_endpoint: {
        name: 'QuickBooks API Endpoint',
        url: `https://quickbooks.api.intuit.com/oauth2/v1/authorize?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `access_type=offline`,
        description: 'Using quickbooks.api.intuit.com endpoint'
      },

      // With additional QuickBooks specific parameters
      quickbooks_specific: {
        name: 'QuickBooks Specific',
        url: `https://appcenter.intuit.com/connect/oauth2?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `access_type=offline&` +
          `prompt=consent`,
        description: 'With QuickBooks specific parameters'
      }
    };

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      redirectUri: redirectUri,
      scopes: scopes,
      qboEnv: process.env.QBO_ENV,
      oauthTests: oauthTests,
      instructions: [
        '1. Try each OAuth test above to see which one works',
        '2. Look for the QuickBooks login page (not an error page)',
        '3. The "missing query parameters" error suggests we need different parameters',
        '4. Try the Platform Endpoint or QuickBooks API Endpoint first',
        '5. If none work, there might be an issue with your app configuration',
        '6. Make sure your app is properly configured in the Intuit Developer Dashboard'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test standard OAuth parameters'
    }, { status: 500 });
  }
}
