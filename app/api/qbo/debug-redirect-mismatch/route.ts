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
    
    // Test different redirect URI formats that might be configured in QuickBooks
    const redirectUriTests = {
      // Test 1: Current redirect URI
      current: {
        name: 'Current Redirect URI',
        redirectUri: redirectUri,
        encoded: encodeURIComponent(redirectUri),
        description: 'What we\'re currently using'
      },

      // Test 2: With trailing slash
      with_trailing_slash: {
        name: 'With Trailing Slash',
        redirectUri: redirectUri + '/',
        encoded: encodeURIComponent(redirectUri + '/'),
        description: 'Add trailing slash to redirect URI'
      },

      // Test 3: Without trailing slash (if current has one)
      without_trailing_slash: {
        name: 'Without Trailing Slash',
        redirectUri: redirectUri.replace(/\/$/, ''),
        encoded: encodeURIComponent(redirectUri.replace(/\/$/, '')),
        description: 'Remove trailing slash from redirect URI'
      },

      // Test 4: With www prefix
      with_www: {
        name: 'With WWW Prefix',
        redirectUri: redirectUri.replace('https://pcsmilesai.com', 'https://www.pcsmilesai.com'),
        encoded: encodeURIComponent(redirectUri.replace('https://pcsmilesai.com', 'https://www.pcsmilesai.com')),
        description: 'Add www prefix to domain'
      },

      // Test 5: Without www prefix (if current has one)
      without_www: {
        name: 'Without WWW Prefix',
        redirectUri: redirectUri.replace('https://www.pcsmilesai.com', 'https://pcsmilesai.com'),
        encoded: encodeURIComponent(redirectUri.replace('https://www.pcsmilesai.com', 'https://pcsmilesai.com')),
        description: 'Remove www prefix from domain'
      }
    };

    // Create OAuth URLs for each redirect URI test
    const oauthTests = {};
    Object.entries(redirectUriTests).forEach(([key, test]) => {
      oauthTests[key] = {
        name: test.name,
        description: test.description,
        redirectUri: test.redirectUri,
        encoded: test.encoded,
        platformUrl: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${test.encoded}&access_type=offline&state=${state}`,
        appcenterUrl: `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${test.encoded}&access_type=offline&state=${state}`
      };
    });

    return NextResponse.json({
      environment: 'Vercel Production',
      timestamp: new Date().toISOString(),
      clientId: `${clientId.substring(0, 8)}...`,
      scopes: scopes,
      state: state,
      redirectUriTests: redirectUriTests,
      oauthTests: oauthTests,
      analysis: {
        issue: 'Redirect URI mismatch between what we send and what\'s configured in QuickBooks app',
        possibleCauses: [
          'Trailing slash mismatch (with/without /)',
          'WWW prefix mismatch (with/without www)',
          'Case sensitivity issues',
          'Extra spaces or characters',
          'Wrong domain or path',
          'App configured for different endpoint'
        ],
        nextSteps: [
          'Check your QuickBooks Developer Dashboard for the exact redirect URI',
          'Try each redirect URI variation below',
          'Test both Platform and AppCenter endpoints',
          'Make sure the redirect URI matches exactly in your app configuration'
        ]
      },
      instructions: [
        '1. Go to https://developer.intuit.com/app/developer/myapps',
        '2. Select your app → Keys tab',
        '3. Check the "Redirect URIs" section',
        '4. Copy the EXACT redirect URI listed there',
        '5. Compare it with the variations below',
        '6. Test the OAuth URL that matches your app configuration'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to debug redirect URI mismatch'
    }, { status: 500 });
  }
}
