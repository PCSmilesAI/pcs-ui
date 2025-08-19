/**
 * QuickBooks OAuth Connect - Vercel Serverless Function
 * Handles OAuth 2.0 authorization URL generation without external package dependencies
 */
export async function GET() {
  try {
    // Get environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';
    const scopes = process.env.QBO_SCOPES;

    // Validate required environment variables
    if (!clientId || !clientSecret || !redirectUri || !scopes) {
      console.error('❌ Missing required environment variables for QBO OAuth');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required environment variables',
          required: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_SCOPES']
        }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          } 
        }
      );
    }

    // Generate state token for CSRF protection
    const stateToken = 'qbo_oauth_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Determine the base URL based on environment
    const baseUrl = environment === 'sandbox' 
      ? 'https://sandbox-accounts.platform.intuit.com'
      : 'https://accounts.platform.intuit.com';

    // Build the OAuth authorization URL manually
    const authUrl = new URL('/oauth2/v1/authorizations/request', baseUrl);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', stateToken);

    console.log('🔗 Generated QuickBooks OAuth URL:', authUrl.toString());
    console.log('🔒 State Token:', stateToken);
    console.log('🔄 Redirecting browser to QuickBooks authorization...');

    // Automatically redirect the browser to QuickBooks authorization
    return new Response(null, {
      status: 302, // Redirect status
      headers: {
        'Location': authUrl.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('❌ Error in QBO connect route:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to initiate OAuth flow',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        } 
      }
    );
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
