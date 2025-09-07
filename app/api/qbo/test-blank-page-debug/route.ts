import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !redirectUri || !scopes) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different approaches to fix the blank page issue
    const blankPageTests = {
      // Test with different user agents
      with_user_agent: {
        name: 'With User Agent Header',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline`,
        description: 'Test if user agent affects page loading',
        note: 'This will redirect with proper headers'
      },

      // Test with different parameters
      minimal_params: {
        name: 'Minimal Parameters',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`,
        description: 'Test with only essential parameters',
        note: 'Removed scope and access_type'
      },

      // Test with different redirect URI format
      different_redirect: {
        name: 'Different Redirect Format',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&state=test123`,
        description: 'Test with state parameter added',
        note: 'Added state parameter for security'
      },

      // Test if it's a browser issue
      browser_test: {
        name: 'Browser Compatibility Test',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline`,
        description: 'Test in different browsers',
        note: 'Try Chrome, Firefox, Safari, Edge'
      },

      // Test if it's a network issue
      network_test: {
        name: 'Network Test',
        url: `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline`,
        description: 'Test network connectivity',
        note: 'Check if it loads in incognito mode'
      }
    };

    // Create a test page that tries to load the OAuth URL in an iframe
    const testPageHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>QuickBooks OAuth Blank Page Debug</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 1000px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
          .button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
          .button:hover { background-color: #0056b3; }
          .iframe-container { margin: 20px 0; border: 2px solid #007bff; border-radius: 5px; }
          iframe { width: 100%; height: 600px; border: none; }
          .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
          .loading { background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
          .error { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔍 QuickBooks OAuth Blank Page Debug</h1>
          
          <div class="test-section">
            <h2>Test 1: Direct Link Test</h2>
            <p>Click this button to test the OAuth URL directly:</p>
            <button class="button" onclick="testDirectLink()">Test Direct Link</button>
            <div id="directLinkResult" class="status" style="display: none;"></div>
          </div>

          <div class="test-section">
            <h2>Test 2: Iframe Test</h2>
            <p>This will try to load the OAuth page in an iframe to see if it loads:</p>
            <button class="button" onclick="testIframe()">Load in Iframe</button>
            <button class="button" onclick="clearIframe()">Clear Iframe</button>
            <div id="iframeResult" class="status" style="display: none;"></div>
            <div id="iframeContainer" class="iframe-container" style="display: none;">
              <iframe id="oauthIframe" src="about:blank"></iframe>
            </div>
          </div>

          <div class="test-section">
            <h2>Test 3: Network Test</h2>
            <p>Test if the OAuth endpoint is reachable:</p>
            <button class="button" onclick="testNetwork()">Test Network</button>
            <div id="networkResult" class="status" style="display: none;"></div>
          </div>

          <div class="test-section">
            <h2>Test 4: Browser Console Test</h2>
            <p>Open browser console (F12) and check for errors when testing the OAuth flow.</p>
            <div class="status loading">
              <strong>Instructions:</strong>
              <ol>
                <li>Open browser console (F12 → Console tab)</li>
                <li>Click "Test Direct Link" above</li>
                <li>Look for any JavaScript errors or network errors</li>
                <li>Check if the page loads but appears blank</li>
              </ol>
            </div>
          </div>

          <div class="test-section">
            <h2>Alternative OAuth URLs to Test</h2>
            <p>Try these alternative OAuth URLs:</p>
            <button class="button" onclick="testAlternative1()">Test Alternative 1 (Minimal)</button>
            <button class="button" onclick="testAlternative2()">Test Alternative 2 (With State)</button>
            <button class="button" onclick="testAlternative3()">Test Alternative 3 (Different Endpoint)</button>
          </div>
        </div>

        <script>
          const oauthUrl = 'https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline';
          const minimalUrl = 'https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}';
          const stateUrl = 'https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&state=test123';
          const altEndpointUrl = 'https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline';

          function testDirectLink() {
            const result = document.getElementById('directLinkResult');
            result.style.display = 'block';
            result.className = 'status loading';
            result.innerHTML = 'Opening OAuth URL in new tab...';
            window.open(oauthUrl, '_blank');
            setTimeout(() => {
              result.className = 'status success';
              result.innerHTML = 'OAuth URL opened. Check if you see the QuickBooks login page or a blank page.';
            }, 1000);
          }

          function testIframe() {
            const container = document.getElementById('iframeContainer');
            const iframe = document.getElementById('oauthIframe');
            const result = document.getElementById('iframeResult');
            
            result.style.display = 'block';
            result.className = 'status loading';
            result.innerHTML = 'Loading OAuth page in iframe...';
            
            container.style.display = 'block';
            iframe.src = oauthUrl;
            
            iframe.onload = function() {
              result.className = 'status success';
              result.innerHTML = 'Iframe loaded. Check if you can see the QuickBooks login page inside the iframe.';
            };
            
            iframe.onerror = function() {
              result.className = 'status error';
              result.innerHTML = 'Error loading iframe. This might indicate a CORS issue or the page is blocking iframe embedding.';
            };
          }

          function clearIframe() {
            const container = document.getElementById('iframeContainer');
            const iframe = document.getElementById('oauthIframe');
            container.style.display = 'none';
            iframe.src = 'about:blank';
          }

          function testNetwork() {
            const result = document.getElementById('networkResult');
            result.style.display = 'block';
            result.className = 'status loading';
            result.innerHTML = 'Testing network connectivity...';
            
            fetch(oauthUrl, { method: 'HEAD' })
              .then(response => {
                result.className = 'status success';
                result.innerHTML = \`Network test successful. Status: \${response.status}\`;
              })
              .catch(error => {
                result.className = 'status error';
                result.innerHTML = \`Network test failed: \${error.message}\`;
              });
          }

          function testAlternative1() {
            window.open(minimalUrl, '_blank');
          }

          function testAlternative2() {
            window.open(stateUrl, '_blank');
          }

          function testAlternative3() {
            window.open(altEndpointUrl, '_blank');
          }
        </script>
      </body>
      </html>
    `;

    return new NextResponse(testPageHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to create blank page debug test'
    }, { status: 500 });
  }
}
