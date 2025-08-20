/**
 * Complete QuickBooks OAuth Flow
 * Manually exchanges authorization code for access tokens
 */

const https = require('https');

module.exports = async (req, res) => {
  try {
    console.log('🔄 Starting manual OAuth completion...');
    
    // Only handle POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

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
    
    console.log('🔧 Environment check:', { 
      clientId: !!clientId, 
      clientSecret: !!clientSecret, 
      redirectUri: !!redirectUri,
      environment: environment
    });
    
    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ Missing environment variables');
      return res.status(500).json({ 
        error: 'Missing required environment variables',
        details: 'QBO_CLIENT_ID, QBO_CLIENT_SECRET, or QBO_REDIRECT_URI not set'
      });
    }
    
    console.log('🔧 Environment variables loaded successfully');
    
    // Determine the token endpoint
    const tokenEndpoint = environment === 'sandbox'
      ? 'sandbox-oauth.platform.intuit.com'
      : 'oauth.platform.intuit.com';
    
    console.log('🎯 Token endpoint:', tokenEndpoint);
    
    // Create base64 credentials
    const credentials = clientId + ':' + clientSecret;
    const base64Credentials = Buffer.from(credentials).toString('base64');
    
    // Prepare the token exchange request body (simple string instead of URLSearchParams)
    const tokenRequestBody = `grant_type=authorization_code&code=${encodeURIComponent(authorizationCode)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    console.log('📤 Sending token exchange request...');
    
    // Make the token exchange request
    const tokenData = await makeHttpsRequest(tokenEndpoint, '/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${base64Credentials}`,
        'Accept': 'application/json'
      },
      body: tokenRequestBody
    });
    
    console.log('✅ Token exchange successful!');
    
    // Return success response
    const response = {
      message: 'OAuth completed successfully!',
      tokens: {
        accessTokenReceived: !!tokenData.access_token,
        refreshTokenReceived: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in || 0,
        tokenType: tokenData.token_type || 'Bearer',
        realmId: tokenData.realmId || 'Not provided in response',
        environment: environment
      },
      nextSteps: [
        'Access tokens have been received and are ready for use',
        'You can now make QuickBooks API calls',
        'Set up webhook subscriptions for real-time updates',
        'Test the integration with sample API calls'
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

// Helper function to make HTTPS requests
function makeHttpsRequest(hostname, path, options) {
  return new Promise((resolve, reject) => {
    console.log(`🌐 Making HTTPS request to: ${hostname}${path}`);
    
    const requestOptions = {
      hostname: hostname,
      port: 443,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    console.log('📋 Request options:', JSON.stringify(requestOptions, null, 2));
    
    const req = https.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('📥 Response received:');
        console.log('  - Status:', res.statusCode);
        console.log('  - Headers:', res.headers);
        console.log('  - Data length:', data.length);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            console.log('✅ Response parsed successfully');
            resolve(jsonData);
          } catch (parseError) {
            console.error('❌ Failed to parse JSON response:', parseError);
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        } else {
          console.error('❌ Request failed with status:', res.statusCode);
          console.error('❌ Response data:', data);
          reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    if (options.body) {
      console.log('📤 Writing request body:', options.body);
      req.write(options.body);
    }
    
    req.end();
  });
}
