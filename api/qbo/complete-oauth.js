const https = require('https');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    console.log('🔄 Starting manual OAuth completion...');
    const { authorizationCode } = req.body;
    
    if (!authorizationCode) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    // Load environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';
    
    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ Missing environment variables:', { clientId: !!clientId, clientSecret: !!clientSecret, redirectUri: !!redirectUri });
      return res.status(500).json({ error: 'Missing QuickBooks configuration' });
    }
    
    console.log('✅ Environment variables loaded');
    
    // Determine token endpoint based on environment
    const tokenEndpoint = environment === 'sandbox' 
      ? 'sandbox-oauth.platform.intuit.com' 
      : 'oauth.platform.intuit.com';
    
    // Prepare credentials for Basic Auth
    const credentials = clientId + ':' + clientSecret;
    const base64Credentials = Buffer.from(credentials).toString('base64');
    
    // Prepare request body
    const tokenRequestBody = `grant_type=authorization_code&code=${encodeURIComponent(authorizationCode)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    console.log('🔄 Making token request to:', tokenEndpoint);
    
    // Make the token request
    const tokenData = await makeHttpsRequest(tokenEndpoint, '/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${base64Credentials}`,
        'Accept': 'application/json'
      },
      body: tokenRequestBody
    });
    
    console.log('✅ Token request successful');
    
    // Parse the response
    if (tokenData.access_token) {
      console.log('🎉 OAuth completed successfully!');
      console.log('📝 Access Token:', tokenData.access_token.substring(0, 20) + '...');
      console.log('📝 Refresh Token:', tokenData.refresh_token ? tokenData.refresh_token.substring(0, 20) + '...' : 'None');
      console.log('📝 Realm ID:', tokenData.realmId);
      
      return res.status(200).json({
        success: true,
        message: 'OAuth completed successfully!',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        realmId: tokenData.realmId,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type
      });
    } else {
      console.error('❌ No access token in response:', tokenData);
      return res.status(500).json({ error: 'No access token received' });
    }
    
  } catch (error) {
    console.error('❌ OAuth completion error:', error);
    return res.status(500).json({
      error: 'Internal server error during OAuth completion',
      details: error.message
    });
  }
};

function makeHttpsRequest(hostname, path, options) {
  return new Promise((resolve, reject) => {
    const data = [];
    
    const req = https.request({
      hostname,
      port: 443,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      res.on('data', (chunk) => {
        data.push(chunk);
      });
      
      res.on('end', () => {
        try {
          const responseBody = Buffer.concat(data).toString();
          console.log('📡 Response status:', res.statusCode);
          console.log('📡 Response headers:', res.headers);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const jsonResponse = JSON.parse(responseBody);
            resolve(jsonResponse);
          } else {
            console.error('❌ HTTP error:', res.statusCode, responseBody);
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        } catch (parseError) {
          console.error('❌ Response parsing error:', parseError);
          reject(new Error('Failed to parse response'));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}
