/**
 * Complete QuickBooks OAuth Flow
 * Manually exchanges authorization code for access tokens
 */

module.exports = async (req, res) => {
  try {
    // Only handle POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🔄 Starting manual OAuth completion...');
    
    // Get the request body
    const { authorizationCode } = req.body;
    
    if (!authorizationCode) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    console.log('🔑 Authorization code received:', authorizationCode ? '***' + authorizationCode.slice(-4) : 'none');
    
    // Get environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';
    
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).json({ error: 'Missing required environment variables' });
    }
    
    console.log('🔧 Environment variables loaded successfully');
    console.log('🌍 Environment:', environment);
    
    // Determine the token endpoint
    const tokenEndpoint = environment === 'sandbox'
      ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    
    console.log('🎯 Token endpoint:', tokenEndpoint);
    
    // Create base64 credentials
    const credentials = clientId + ':' + clientSecret;
    let base64Credentials;
    
    // Handle base64 encoding for different environments
    if (typeof btoa !== 'undefined') {
      // Browser environment
      base64Credentials = btoa(credentials);
    } else {
      // Node.js environment
      base64Credentials = Buffer.from(credentials).toString('base64');
    }
    
    // Prepare the token exchange request
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri
    });
    
    console.log('📤 Sending token exchange request...');
    
    // Make the token exchange request
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${base64Credentials}`,
        'Accept': 'application/json'
      },
      body: tokenRequestBody.toString()
    });
    
    console.log('📥 Token response received:');
    console.log('  - Status:', tokenResponse.status);
    console.log('  - Status Text:', tokenResponse.statusText);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', errorText);
      
      // Try to parse error details
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.error_description || errorJson.error || errorText;
      } catch (e) {
        console.log('Could not parse error as JSON, using raw text');
      }
      
      return res.status(400).json({ 
        error: 'Token exchange failed',
        details: errorDetails,
        status: tokenResponse.status
      });
    }
    
    // Parse the successful response
    const tokenData = await tokenResponse.json();
    console.log('✅ Token exchange successful!');
    console.log('  - Access Token:', tokenData.access_token ? '***' + tokenData.access_token.slice(-4) : 'none');
    console.log('  - Refresh Token:', tokenData.refresh_token ? '***' + tokenData.refresh_token.slice(-4) : 'none');
    console.log('  - Expires In:', tokenData.expires_in, 'seconds');
    console.log('  - Token Type:', tokenData.token_type);
    
    // Store tokens securely (in production, use a secure database)
    // For now, we'll just log them and return success
    const tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      realmId: tokenData.realmId, // May be included in some responses
      environment: environment
    };
    
    // TODO: Store tokens securely in your database
    console.log('💾 Tokens received and ready for storage');
    
    // Return success response
    const response = {
      message: 'OAuth completed successfully!',
      tokens: {
        accessTokenReceived: !!tokenData.access_token,
        refreshTokenReceived: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        realmId: tokenData.realmId || 'Not provided in response',
        environment: environment
      },
      nextSteps: [
        'Access tokens have been received and are ready for use',
        'You can now make QuickBooks API calls',
        'Set up webhook subscriptions for real-time updates',
        'Test the integration with sample API calls',
        'Implement token refresh logic for production use'
      ]
    };
    
    console.log('🎉 OAuth completion successful!');
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ OAuth completion error:', error);
    return res.status(500).json({ 
      error: 'Internal server error during OAuth completion',
      details: error.message
    });
  }
};
