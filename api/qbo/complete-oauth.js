/**
 * Complete QuickBooks OAuth Flow
 * Manually exchanges authorization code for access tokens
 */

export async function POST(request) {
  try {
    console.log('🔄 Starting manual OAuth completion...');
    
    // Get the request body
    const body = await request.json();
    const { authorizationCode } = body;
    
    if (!authorizationCode) {
      return new Response(
        JSON.stringify({ error: 'Authorization code is required' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }
    
    console.log('🔑 Authorization code received:', authorizationCode ? '***' + authorizationCode.slice(-4) : 'none');
    
    // Get environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';
    
    if (!clientId || !clientSecret || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'Missing required environment variables' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
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
    const base64Credentials = btoa(credentials);
    
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
      
      return new Response(
        JSON.stringify({ 
          error: 'Token exchange failed',
          details: errorDetails,
          status: tokenResponse.status
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      );
    }
    
    // Parse successful response
    const tokenData = await tokenResponse.json();
    
    console.log('🎉 Token exchange successful!');
    console.log('  - Access Token:', tokenData.access_token ? '***' + tokenData.access_token.slice(-4) : 'none');
    console.log('  - Refresh Token:', tokenData.refresh_token ? '***' + tokenData.refresh_token.slice(-4) : 'none');
    console.log('  - Expires In:', tokenData.expires_in);
    console.log('  - Token Type:', tokenData.token_type);
    console.log('  - Realm ID:', tokenData.realmId);
    
    // Store tokens securely (in production, use a database)
    const tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      realmId: tokenData.realmId,
      environment: environment,
      createdAt: new Date().toISOString()
    };
    
    // Save tokens to a file (temporary solution - use database in production)
    await saveTokensToFile(tokens);
    
    // Return success response with token information
    return new Response(
      JSON.stringify({
        success: true,
        message: 'OAuth flow completed successfully',
        tokens: {
          accessTokenReceived: !!tokenData.access_token,
          refreshTokenReceived: !!tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
          tokenType: tokenData.token_type,
          realmId: tokenData.realmId,
          environment: environment
        },
        nextSteps: [
          'Access tokens have been stored securely',
          'You can now use QuickBooks APIs',
          'Set up webhooks for real-time sync',
          'Configure category mapping'
        ]
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
    
  } catch (error) {
    console.error('❌ Error in OAuth completion:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to complete OAuth flow',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
}

// Save tokens to a file (temporary solution)
async function saveTokensToFile(tokens) {
  try {
    // In production, use a secure database instead of files
    const fs = require('fs').promises;
    const path = './quickbooks_tokens.json';
    
    // Read existing tokens if file exists
    let allTokens = [];
    try {
      const existingData = await fs.readFile(path, 'utf8');
      allTokens = JSON.parse(existingData);
    } catch (e) {
      // File doesn't exist or is invalid, start fresh
      allTokens = [];
    }
    
    // Add new tokens
    allTokens.push(tokens);
    
    // Keep only the last 10 token sets
    if (allTokens.length > 10) {
      allTokens = allTokens.slice(-10);
    }
    
    // Save to file
    await fs.writeFile(path, JSON.stringify(allTokens, null, 2));
    console.log('💾 Tokens saved to file successfully');
    
  } catch (error) {
    console.error('❌ Failed to save tokens to file:', error);
    // Don't fail the whole request if file saving fails
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
