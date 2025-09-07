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

    // Test the Platform endpoint with different approaches
    const platformTests = {
      // Direct redirect to Platform endpoint
      direct_redirect: {
        name: 'Direct Platform Redirect',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `access_type=offline`,
        description: 'Direct redirect to Platform OAuth endpoint'
      },

      // Platform endpoint with state parameter
      with_state: {
        name: 'Platform with State',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `state=platform_test_${Date.now()}&` +
          `access_type=offline`,
        description: 'Platform endpoint with state parameter'
      },

      // Platform endpoint with additional parameters
      with_additional: {
        name: 'Platform with Additional Params',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?` +
          `client_id=${clientId}&` +
          `response_type=code&` +
          `scope=${scopes}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `access_type=offline&` +
          `prompt=consent&` +
          `include_granted_scopes=true`,
        description: 'Platform endpoint with additional OAuth parameters'
      },

      // Test if we need to handle the response differently
      test_response: {
        name: 'Test Response Handling',
        url: `/api/qbo/test-platform-callback`,
        description: 'Test how we handle the Platform OAuth callback'
      }
    };

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      redirectUri: redirectUri,
      scopes: scopes,
      qboEnv: process.env.QBO_ENV,
      platformTests: platformTests,
      analysis: {
        platformEndpoint: 'https://oauth.platform.intuit.com/oauth2/v1/authorize',
        expectedBehavior: 'Should redirect to QuickBooks login page',
        blankPagePossibleCauses: [
          'JavaScript disabled in browser',
          'QuickBooks login page not loading properly',
          'Network/CORS issues',
          'Missing required parameters',
          'App not properly configured for Platform endpoint'
        ]
      },
      instructions: [
        '1. Try the "Direct Platform Redirect" first',
        '2. If you get a blank page, try "Platform with State"',
        '3. If still blank, try "Platform with Additional Params"',
        '4. Check if JavaScript is enabled in your browser',
        '5. Try opening the URL in an incognito/private window',
        '6. Check browser console for any JavaScript errors',
        '7. The blank page might be a QuickBooks login page that\'s not loading properly'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test Platform endpoint response'
    }, { status: 500 });
  }
}
