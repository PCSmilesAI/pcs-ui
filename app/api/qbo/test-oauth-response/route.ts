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

    // Generate a secure random state parameter
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Test different OAuth configurations to find what works
    const oauthTests = {
      // Test 1: Platform endpoint with state
      platform_with_state: {
        name: 'Platform with State (Current)',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&state=${state}`,
        description: 'Current configuration that shows blank page'
      },

      // Test 2: Platform endpoint without access_type
      platform_no_access_type: {
        name: 'Platform without access_type',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
        description: 'Remove access_type parameter'
      },

      // Test 3: Platform endpoint with different scope format
      platform_different_scope: {
        name: 'Platform with Different Scope',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
        description: 'Use hardcoded scope instead of variable'
      },

      // Test 4: AppCenter endpoint with state
      appcenter_with_state: {
        name: 'AppCenter with State',
        url: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&state=${state}`,
        description: 'Try AppCenter endpoint with state parameter'
      },

      // Test 5: Platform endpoint with additional parameters
      platform_with_extra: {
        name: 'Platform with Extra Parameters',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&state=${state}&prompt=consent&include_granted_scopes=true`,
        description: 'Add additional OAuth parameters'
      }
    };

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      redirectUri: redirectUri,
      scopes: scopes,
      state: state,
      oauthTests: oauthTests,
      analysis: {
        currentIssue: 'Blank page after fixing state parameter',
        possibleCauses: [
          'Browser compatibility issues',
          'JavaScript disabled or blocked',
          'Network/CORS restrictions',
          'QuickBooks app configuration issues',
          'Missing required parameters',
          'Wrong OAuth endpoint for your app type'
        ],
        nextSteps: [
          'Try each OAuth test below',
          'Test in different browsers (Chrome, Firefox, Safari, Edge)',
          'Try incognito/private mode',
          'Check browser console for errors',
          'Verify your QuickBooks app is configured for the right environment'
        ]
      },
      instructions: [
        '1. Try each OAuth test below to see which one works',
        '2. Look for the QuickBooks login page (not blank)',
        '3. Test in different browsers if needed',
        '4. Check browser console for JavaScript errors',
        '5. The blank page might be a loading issue or browser compatibility problem'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test OAuth response'
    }, { status: 500 });
  }
}
