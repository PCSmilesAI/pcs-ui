/**
 * QuickBooks OAuth Connect - Vercel Serverless Function
 * Bulletproof OAuth 2.0 implementation with multiple fallback strategies
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

    // Use the correct QuickBooks OAuth endpoint
    // The previous endpoint was incorrect - this is the right one
    const baseUrl = environment === 'sandbox' 
      ? 'https://appcenter.intuit.com'
      : 'https://appcenter.intuit.com';

    // Build the OAuth authorization URL using the correct endpoint
    const authUrl = new URL('/connect/oauth2', baseUrl);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', stateToken);

    console.log('🔗 Generated QuickBooks OAuth URL:', authUrl.toString());
    console.log('🔒 State Token:', stateToken);
    console.log('🔄 Creating bulletproof redirect page...');

    // Create a bulletproof HTML page with multiple redirect strategies
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
            max-width: 500px;
            width: 90%;
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
            margin: 0 0 1rem 0;
            opacity: 0.9;
            line-height: 1.5;
        }
        .redirect-info {
            margin-top: 1rem;
            font-size: 0.9rem;
            opacity: 0.7;
        }
        .manual-link {
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
        .manual-link:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
        .status {
            margin-top: 1rem;
            font-size: 0.8rem;
            opacity: 0.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>Connecting to QuickBooks...</h1>
        <p>Please wait while we redirect you to QuickBooks authorization.</p>
        <p>This may take a few moments as we establish the secure connection.</p>
        
        <div class="redirect-info">
            <a href="${authUrl.toString()}" class="manual-link">
                🚀 Click here to connect manually
            </a>
        </div>
        
        <div class="status" id="status">Initializing connection...</div>
    </div>
    
    <script>
        const authUrl = '${authUrl.toString()}';
        const statusEl = document.getElementById('status');
        
        // Strategy 1: Immediate redirect attempt
        function attemptRedirect() {
            statusEl.textContent = 'Attempting automatic redirect...';
            try {
                window.location.href = authUrl;
            } catch (error) {
                console.error('Redirect failed:', error);
                statusEl.textContent = 'Automatic redirect failed, please use manual link above';
            }
        }
        
        // Strategy 2: Delayed redirect with user interaction
        function delayedRedirect() {
            statusEl.textContent = 'Preparing redirect...';
            setTimeout(() => {
                statusEl.textContent = 'Redirecting now...';
                attemptRedirect();
            }, 2000);
        }
        
        // Strategy 3: Window.open fallback
        function openInNewWindow() {
            statusEl.textContent = 'Opening in new window...';
            try {
                const newWindow = window.open(authUrl, '_blank', 'width=800,height=600');
                if (newWindow) {
                    statusEl.textContent = 'Opened in new window - please complete authorization there';
                } else {
                    statusEl.textContent = 'Popup blocked - please use manual link above';
                }
            } catch (error) {
                console.error('Window.open failed:', error);
                statusEl.textContent = 'Failed to open new window - please use manual link above';
            }
        }
        
        // Strategy 4: Form submission fallback
        function formRedirect() {
            statusEl.textContent = 'Using form redirect...';
            const form = document.createElement('form');
            form.method = 'GET';
            form.action = authUrl;
            document.body.appendChild(form);
            form.submit();
        }
        
        // Execute all strategies with fallbacks
        console.log('🚀 Starting bulletproof QuickBooks OAuth redirect...');
        console.log('🔗 Target URL:', authUrl);
        
        // Try immediate redirect first
        attemptRedirect();
        
        // If immediate redirect doesn't work, try delayed redirect
        setTimeout(() => {
            if (window.location.href !== authUrl) {
                console.log('⏰ Delayed redirect attempt...');
                delayedRedirect();
            }
        }, 1000);
        
        // If still not redirected, try window.open
        setTimeout(() => {
            if (window.location.href !== authUrl) {
                console.log('🪟 Trying window.open fallback...');
                openInNewWindow();
            }
        }, 4000);
        
        // Final fallback: form submission
        setTimeout(() => {
            if (window.location.href !== authUrl) {
                console.log('📝 Using form submission fallback...');
                formRedirect();
            }
        }, 6000);
        
        // Log any errors
        window.addEventListener('error', (error) => {
            console.error('❌ Page error:', error);
            statusEl.textContent = 'Error occurred - please use manual link above';
        });
        
        // Check if we're still on the same page after 10 seconds
        setTimeout(() => {
            if (window.location.href !== authUrl) {
                statusEl.textContent = '⚠️ Automatic redirect failed - please use manual link above';
                console.warn('⚠️ All automatic redirect strategies failed');
            }
        }, 10000);
    </script>
</body>
</html>`;

    // Return the bulletproof HTML page
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
