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
    console.log('🔑 Client ID:', clientId ? '***' + clientId.slice(-4) : 'none');
    console.log('🔒 Client Secret:', clientSecret ? '***' + clientSecret.slice(-4) : 'none');
    console.log('🔄 Redirect URI:', redirectUri);
    console.log('🌍 Environment:', environment);

    // Determine the token endpoint based on environment
    const tokenEndpoint = environment === 'sandbox'
      ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    console.log('🎯 Token endpoint:', tokenEndpoint);

    // Create base64 encoded credentials (Vercel-compatible way)
    const credentials = clientId + ':' + clientSecret;
    const base64Credentials = btoa(credentials);

    // Exchange authorization code for access token using direct HTTP
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    console.log('📤 Sending token exchange request...');
    console.log('📋 Request body:', tokenRequestBody.toString());

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${base64Credentials}`,
        'Accept': 'application/json'
      },
      body: tokenRequestBody.toString()
    });

    console.log('📥 Token response status:', tokenResponse.status);
    console.log('📥 Token response headers:', Object.fromEntries(tokenResponse.headers.entries()));

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      
      // Try to parse error as JSON for better error details
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.error_description || errorJson.error || errorText;
      } catch (e) {
        // Keep original error text if not JSON
      }
      
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorDetails}`);
    }

    const tokenData = await tokenResponse.json();
    
    console.log('🎉 Successfully obtained access token');
    console.log('🔑 Access Token:', tokenData.access_token ? '***' + tokenData.access_token.slice(-4) : 'none');
    console.log('🔄 Refresh Token:', tokenData.refresh_token ? '***' + tokenData.refresh_token.slice(-4) : 'none');
    console.log('⏰ Expires In:', tokenData.expires_in);
    console.log('🏷️ Token Type:', tokenData.token_type);

    // Create a success page instead of JSON response
    const successHtml = `
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

    // Return success HTML page
    return new Response(successHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('❌ Error in QBO callback route:', error);
    
    // Create an error page instead of JSON response
    const errorHtml = `
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
            max-width: 500px;
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
            ${error.message}
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

    return new Response(errorHtml, {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
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
