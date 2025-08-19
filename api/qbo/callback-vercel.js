import { OAuthClient } from 'intuit-oauth';

/**
 * QuickBooks OAuth Callback - Vercel Serverless Function
 * Handles OAuth 2.0 callback and token exchange
 */
export async function GET(request) {
  try {
    // Get query parameters from URL
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId');

    if (!code) {
      console.error('❌ No authorization code received from QuickBooks');
      return new Response(
        JSON.stringify({ error: 'No authorization code received' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          } 
        }
      );
    }

    console.log('✅ Received authorization code from QuickBooks');
    console.log('📋 Code:', code ? '***' + code.slice(-4) : 'none');
    console.log('🏢 Realm ID:', realmId || 'none');
    console.log('🔒 State:', state || 'none');

    // Get environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';

    // Validate required environment variables
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing required environment variables for token exchange');
    }

    // Initialize Intuit OAuth client
    const oauthClient = new OAuthClient({
      clientId: clientId,
      clientSecret: clientSecret,
      environment: environment,
      redirectUri: redirectUri,
    });

    console.log('🔄 Exchanging authorization code for access token...');

    // Exchange authorization code for access token
    const tokenResponse = await oauthClient.createToken(code, realmId);

    if (tokenResponse.token) {
      console.log('🎉 Successfully obtained access token');
      console.log('🔑 Access Token:', tokenResponse.token.access_token ? '***' + tokenResponse.token.access_token.slice(-4) : 'none');
      console.log('🔄 Refresh Token:', tokenResponse.token.refresh_token ? '***' + tokenResponse.token.refresh_token.slice(-4) : 'none');

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          message: 'OAuth flow completed successfully',
          realmId: realmId,
          accessTokenReceived: !!tokenResponse.token.access_token,
          refreshTokenReceived: !!tokenResponse.token.refresh_token,
          expiresIn: tokenResponse.token.expires_in,
          tokenType: tokenResponse.token.token_type
        }),
        { 
          status: 200, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          } 
        }
      );

    } else {
      throw new Error('No token received from QuickBooks');
    }

  } catch (error) {
    console.error('❌ Error in QBO callback route:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process OAuth callback',
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
