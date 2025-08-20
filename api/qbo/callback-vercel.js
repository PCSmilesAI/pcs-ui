/**
 * QuickBooks OAuth Callback - Vercel Serverless Function
 * Robust callback with retry logic and alternative HTTP methods
 */
export async function GET(request) {
  console.log('🚀 Callback function started');
  
  try {
    // Get query parameters from URL
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId');

    console.log('📋 URL received:', request.url);
    console.log('🔑 Code received:', code ? '***' + code.slice(-4) : 'none');
    console.log('🏢 Realm ID received:', realmId || 'none');
    console.log('🔒 State received:', state || 'none');

    if (!code) {
      console.error('❌ No authorization code received');
      return createErrorPage('No authorization code received from QuickBooks');
    }

    // Get environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';

    console.log('🔧 Environment variables loaded:');
    console.log('  - Client ID:', clientId ? '***' + clientId.slice(-4) : 'MISSING');
    console.log('  - Client Secret:', clientSecret ? '***' + clientSecret.slice(-4) : 'MISSING');
    console.log('  - Redirect URI:', redirectUri || 'MISSING');
    console.log('  - Environment:', environment);

    // Validate environment variables
    if (!clientId || !clientSecret || !redirectUri) {
      const missing = [];
      if (!clientId) missing.push('QBO_CLIENT_ID');
      if (!clientSecret) missing.push('QBO_CLIENT_SECRET');
      if (!redirectUri) missing.push('QBO_REDIRECT_URI');
      
      console.error('❌ Missing environment variables:', missing);
      return createErrorPage(`Missing environment variables: ${missing.join(', ')}`);
    }

    console.log('🔄 Starting token exchange with retry logic...');

    // Create base64 credentials
    const credentials = clientId + ':' + clientSecret;
    const base64Credentials = btoa(credentials);
    console.log('🔐 Base64 credentials created successfully');

    // Determine token endpoint
    const tokenEndpoint = environment === 'sandbox'
      ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    console.log('🎯 Token endpoint:', tokenEndpoint);

    // Prepare request body
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    console.log('📤 Request body prepared:', tokenRequestBody.toString());

    // Try multiple approaches to make the request
    let tokenData = null;
    let lastError = null;

    // Approach 1: Standard fetch with timeout
    try {
      console.log('📡 Attempt 1: Standard fetch with timeout...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${base64Credentials}`,
          'Accept': 'application/json',
          'User-Agent': 'PCS-AI-OAuth/1.0'
        },
        body: tokenRequestBody.toString(),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('📥 Response received:');
      console.log('  - Status:', tokenResponse.status);
      console.log('  - Status Text:', tokenResponse.statusText);
      console.log('  - Headers:', Object.fromEntries(tokenResponse.headers.entries()));

      if (tokenResponse.ok) {
        tokenData = await tokenResponse.json();
        console.log('🎉 Token exchange successful on first attempt!');
      } else {
        const errorText = await tokenResponse.text();
        console.error('❌ Token exchange failed:', errorText);
        throw new Error(`HTTP ${tokenResponse.status}: ${errorText}`);
      }
    } catch (error) {
      lastError = error;
      console.log('❌ First attempt failed:', error.message);
      
      // Approach 2: Try with different headers
      try {
        console.log('📡 Attempt 2: Fetch with simplified headers...');
        const tokenResponse = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${base64Credentials}`
          },
          body: tokenRequestBody.toString()
        });
        
        console.log('📥 Response received (attempt 2):');
        console.log('  - Status:', tokenResponse.status);
        console.log('  - Status Text:', tokenResponse.statusText);

        if (tokenResponse.ok) {
          tokenData = await tokenResponse.json();
          console.log('🎉 Token exchange successful on second attempt!');
        } else {
          const errorText = await tokenResponse.text();
          console.error('❌ Token exchange failed (attempt 2):', errorText);
          throw new Error(`HTTP ${tokenResponse.status}: ${errorText}`);
        }
      } catch (error2) {
        lastError = error2;
        console.log('❌ Second attempt failed:', error2.message);
        
        // Approach 3: Try with different timeout
        try {
          console.log('📡 Attempt 3: Fetch with longer timeout...');
          const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${base64Credentials}`,
              'Accept': 'application/json'
            },
            body: tokenRequestBody.toString()
          });
          
          console.log('📥 Response received (attempt 3):');
          console.log('  - Status:', tokenResponse.status);
          console.log('  - Status Text:', tokenResponse.statusText);

          if (tokenResponse.ok) {
            tokenData = await tokenResponse.json();
            console.log('🎉 Token exchange successful on third attempt!');
          } else {
            const errorText = await tokenResponse.text();
            console.error('❌ Token exchange failed (attempt 3):', errorText);
            throw new Error(`HTTP ${tokenResponse.status}: ${errorText}`);
          }
        } catch (error3) {
          lastError = error3;
          console.log('❌ Third attempt failed:', error3.message);
          throw new Error(`All fetch attempts failed. Last error: ${error3.message}`);
        }
      }
    }

    if (!tokenData) {
      throw new Error('Failed to obtain token data after all attempts');
    }

    console.log('🎉 Token exchange successful!');
    console.log('  - Access Token:', tokenData.access_token ? '***' + tokenData.access_token.slice(-4) : 'none');
    console.log('  - Refresh Token:', tokenData.refresh_token ? '***' + tokenData.refresh_token.slice(-4) : 'none');
    console.log('  - Expires In:', tokenData.expires_in);
    console.log('  - Token Type:', tokenData.token_type);

    // Return success page
    return createSuccessPage(environment, realmId, tokenData);

  } catch (error) {
    console.error('❌ Unexpected error in callback:', error);
    console.error('Error stack:', error.stack);
    
    // Return detailed error page
    return createErrorPage(`Unexpected error: ${error.message}`, error.stack);
  }
}

// Helper function to create success page
function createSuccessPage(environment, realmId, tokenData) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QuickBooks Connected Successfully!</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 1rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 90%;
        }
        .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            margin: 0 0 1rem 0;
            font-size: 1.8rem;
        }
        p {
            margin: 0 0 1rem 0;
            opacity: 0.9;
            line-height: 1.5;
        }
        .details {
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
            text-align: left;
        }
        .back-link {
            display: inline-block;
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            text-decoration: none;
            border-radius: 0.5rem;
            border: 1px solid rgba(255, 255, 255, 0.3);
            transition: all 0.3s ease;
        }
        .back-link:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">🎉</div>
        <h1>QuickBooks Connected Successfully!</h1>
        <p>Your PCS AI application is now connected to QuickBooks.</p>
        
        <div class="details">
            <strong>Connection Details:</strong><br>
            • Environment: ${environment}<br>
            • Company ID: ${realmId || 'Not provided'}<br>
            • Access Token: Received ✅<br>
            • Refresh Token: Received ✅<br>
            • Expires In: ${tokenData.expires_in || 'Unknown'} seconds
        </div>
        
        <p>You can now close this window and return to PCS AI.</p>
        
        <a href="https://www.pcsmilesai.com" class="back-link">
            🏠 Return to PCS AI
        </a>
    </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

// Helper function to create error page
function createErrorPage(message, details = '') {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QuickBooks Connection Failed</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 1rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            width: 90%;
        }
        .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            margin: 0 0 1rem 0;
            font-size: 1.8rem;
        }
        p {
            margin: 0 0 1rem 0;
            opacity: 0.9;
            line-height: 1.5;
        }
        .error-details {
            background: rgba(255, 255, 255, 0.1);
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
            text-align: left;
            font-family: monospace;
            font-size: 0.9rem;
            max-height: 200px;
            overflow-y: auto;
        }
        .retry-link {
            display: inline-block;
            margin-top: 1rem;
            padding: 0.75rem 1.5rem;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            text-decoration: none;
            border-radius: 0.5rem;
            border: 1px solid rgba(255, 255, 255, 0.3);
            transition: all 0.3s ease;
        }
        .retry-link:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>QuickBooks Connection Failed</h1>
        <p>There was an error completing the QuickBooks connection.</p>
        
        <div class="error-details">
            <strong>Error Details:</strong><br>
            ${message}
            ${details ? '<br><br><strong>Technical Details:</strong><br>' + details : ''}
        </div>
        
        <p>Please try again or contact support if the problem persists.</p>
        
        <a href="https://www.pcsmilesai.com/api/qbo/connect" class="retry-link">
            🔄 Try Again
        </a>
        
        <a href="https://www.pcsmilesai.com" class="retry-link" style="margin-left: 1rem;">
            🏠 Return to PCS AI
        </a>
    </div>
</body>
</html>`;

  return new Response(html, {
    status: 500,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
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
