/**
 * QuickBooks OAuth Connect - Vercel Serverless Function
 * Handles OAuth 2.0 authorization URL generation without external package dependencies
 */
export async function GET() {
  try {
    // Get environment variables
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const environment = process.env.QBO_ENV || 'sandbox';
    const scopes = process.env.QBO_SCOPES;

    // Validate required environment variables
    if (!clientId || !clientSecret || !redirectUri || !scopes) {
      console.error('❌ Missing required environment variables for QBO OAuth');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required environment variables',
          required: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REDIRECT_URI', 'QBO_SCOPES']
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

    // Generate state token for CSRF protection
    const stateToken = 'qbo_oauth_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Determine the base URL based on environment
    const baseUrl = environment === 'sandbox' 
      ? 'https://sandbox-accounts.platform.intuit.com'
      : 'https://accounts.platform.intuit.com';

    // Build the OAuth authorization URL manually
    const authUrl = new URL('/oauth2/v1/authorizations/request', baseUrl);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', stateToken);

    console.log('🔗 Generated QuickBooks OAuth URL:', authUrl.toString());
    console.log('🔒 State Token:', stateToken);
    console.log('🔄 Creating HTML redirect page...');

    // Create an HTML page that automatically redirects to QuickBooks
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connecting to QuickBooks...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 1rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h1 {
            margin: 0 0 1rem 0;
            font-size: 1.5rem;
        }
        p {
            margin: 0;
            opacity: 0.9;
        }
        .redirect-info {
            margin-top: 1rem;
            font-size: 0.9rem;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>Connecting to QuickBooks...</h1>
        <p>Please wait while we redirect you to QuickBooks authorization.</p>
        <div class="redirect-info">
            If you're not redirected automatically, 
            <a href="${authUrl.toString()}" style="color: #fff; text-decoration: underline;">click here</a>
        </div>
    </div>
    
    <script>
        // Automatically redirect to QuickBooks after a brief delay
        setTimeout(() => {
            console.log('🔄 Redirecting to QuickBooks OAuth...');
            window.location.href = '${authUrl.toString()}';
        }, 1500);
        
        // Fallback redirect if the main one fails
        setTimeout(() => {
            if (window.location.href !== '${authUrl.toString()}') {
                console.log('🔄 Fallback redirect to QuickBooks OAuth...');
                window.location.href = '${authUrl.toString()}';
            }
        }, 3000);
    </script>
</body>
</html>`;

    // Return the HTML page that will redirect the user
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('❌ Error in QBO connect route:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to initiate OAuth flow',
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
