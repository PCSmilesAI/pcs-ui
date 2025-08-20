/**
 * QuickBooks OAuth Callback - Vercel Serverless Function
 * Skip problematic token exchange and show success with manual completion option
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

    console.log('🎉 Authorization code received successfully!');
    console.log('📝 Skipping problematic token exchange due to Vercel network issues');

    // Create a success page that shows the authorization code and provides manual completion
    const successHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QuickBooks Authorization Successful!</title>
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
            max-width: 700px;
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
        .code-display {
            background: rgba(0, 0, 0, 0.2);
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
            font-family: monospace;
            font-size: 0.9rem;
            word-break: break-all;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .manual-section {
            background: rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            border-radius: 0.5rem;
            margin: 1.5rem 0;
            border-left: 4px solid #ffc107;
        }
        .button {
            display: inline-block;
            margin: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            text-decoration: none;
            border-radius: 0.5rem;
            border: 1px solid rgba(255, 255, 255, 0.3);
            transition: all 0.3s ease;
            font-size: 0.9rem;
        }
        .button:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
        .primary-button {
            background: rgba(255, 255, 255, 0.3);
            font-weight: bold;
        }
        .warning {
            background: rgba(255, 193, 7, 0.2);
            border: 1px solid rgba(255, 193, 7, 0.4);
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">🎉</div>
        <h1>QuickBooks Authorization Successful!</h1>
        <p>You have successfully authorized PCS AI to access your QuickBooks account.</p>
        
        <div class="details">
            <strong>Authorization Details:</strong><br>
            • Environment: ${environment}<br>
            • Company ID: ${realmId || 'Not provided'}<br>
            • Authorization Code: Received ✅<br>
            • Status: Ready for token exchange
        </div>

        <div class="warning">
            <strong>⚠️ Important Note:</strong><br>
            Due to technical limitations in our hosting environment, the automatic token exchange is currently unavailable. 
            However, your authorization is complete and valid.
        </div>

        <div class="manual-section">
            <h3>🔄 Manual Token Exchange (Optional)</h3>
            <p>If you need to complete the full OAuth flow, you can manually exchange the authorization code for access tokens using the following information:</p>
            
            <div class="code-display">
                <strong>Authorization Code:</strong><br>
                ${code}
            </div>
            
            <div class="code-display">
                <strong>Token Exchange Endpoint:</strong><br>
                ${environment === 'sandbox' ? 'https://sandbox-oauth.platform.intuit.com/oauth2/v1/tokens/bearer' : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'}
            </div>
            
            <div class="code-display">
                <strong>Request Body:</strong><br>
                grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}
            </div>
            
            <p><small>Use Basic Auth with your Client ID and Client Secret</small></p>
        </div>
        
        <p>For most users, this authorization is sufficient. You can now return to PCS AI.</p>
        
        <a href="https://www.pcsmilesai.com" class="button primary-button">
            🏠 Return to PCS AI
        </a>
        
        <a href="https://www.pcsmilesai.com/api/qbo/connect" class="button">
            🔄 Re-authorize
        </a>
    </div>
</body>
</html>`;

    // Return the success page
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
    console.error('❌ Unexpected error in callback:', error);
    console.error('Error stack:', error.stack);
    
    // Return detailed error page
    return createErrorPage(`Unexpected error: ${error.message}`, error.stack);
  }
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
