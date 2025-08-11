export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const realmId = searchParams.get('realmId');
    
    if (!code) {
      console.error('❌ No authorization code received from QuickBooks');
      return new Response(
        JSON.stringify({ error: 'No authorization code received' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Received authorization code from QuickBooks');
    console.log('📋 Code:', code ? '***' + code.slice(-4) : 'none');
    console.log('🏢 Realm ID:', realmId || 'none');
    console.log('🔒 State:', state || 'none');

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code, realmId);
    
    if (tokenResponse.success) {
      console.log('🎉 Successfully obtained access token');
      console.log('🔑 Access Token:', tokenResponse.accessToken ? '***' + tokenResponse.accessToken.slice(-4) : 'none');
      console.log('🔄 Refresh Token:', tokenResponse.refreshToken ? '***' + tokenResponse.refreshToken.slice(-4) : 'none');
      
      // Store tokens securely (you'll want to implement proper storage)
      // For now, we'll just log them and return success
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'OAuth flow completed successfully',
          realmId: realmId,
          accessTokenReceived: !!tokenResponse.accessToken,
          refreshTokenReceived: !!tokenResponse.refreshToken
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      
    } else {
      console.error('❌ Failed to exchange code for token:', tokenResponse.error);
      return new Response(
        JSON.stringify({ error: 'Failed to exchange authorization code for access token' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
  } catch (error) {
    console.error('❌ Error in QBO callback route:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process OAuth callback' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function exchangeCodeForToken(authorizationCode, realmId) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const qboEnv = process.env.QBO_ENV || 'sandbox';
    
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing required environment variables for token exchange');
    }

    // Determine the token endpoint based on environment
    const tokenEndpoint = qboEnv === 'sandbox'
      ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri
    });

    console.log('🔄 Exchanging authorization code for access token...');
    
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
    
    return {
      success: true,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type
    };
    
  } catch (error) {
    console.error('❌ Error in token exchange:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
