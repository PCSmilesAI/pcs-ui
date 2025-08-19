/**
 * QuickBooks OAuth Callback - Vercel Serverless Function
 * Handles OAuth 2.0 callback and token exchange without external package dependencies
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

    console.log('🔄 Exchanging authorization code for access token...');

    // Determine the token endpoint based on environment
    const tokenEndpoint = environment === 'sandbox'
      ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    // Exchange authorization code for access token using direct HTTP
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: tokenRequestBody.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    console.log('🎉 Successfully obtained access token');
    console.log('🔑 Access Token:', tokenData.access_token ? '***' + tokenData.access_token.slice(-4) : 'none');
    console.log('🔄 Refresh Token:', tokenData.refresh_token ? '***' + tokenData.refresh_token.slice(-4) : 'none');

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'OAuth flow completed successfully',
        realmId: realmId,
        accessTokenReceived: !!tokenData.access_token,
        refreshTokenReceived: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type
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
