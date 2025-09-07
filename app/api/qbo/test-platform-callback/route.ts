import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const realmId = url.searchParams.get('realmId');

    // Log all parameters for debugging
    console.log('🔄 Platform OAuth Callback received:');
    console.log('  - Code:', code ? 'Present' : 'Missing');
    console.log('  - State:', state || 'Missing');
    console.log('  - Error:', error || 'None');
    console.log('  - Error Description:', errorDescription || 'None');
    console.log('  - Realm ID:', realmId || 'Missing');
    console.log('  - Full URL:', req.url);

    // Create a detailed response page
    const responseHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Platform OAuth Callback Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 4px; margin: 10px 0; }
          .error { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 4px; margin: 10px 0; }
          .info { background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 4px; margin: 10px 0; }
          .param { margin: 5px 0; }
          .param strong { display: inline-block; width: 150px; }
          code { background-color: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
          .button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
          .button:hover { background-color: #0056b3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔍 Platform OAuth Callback Test</h1>
          <p>This page shows what parameters were received from the Platform OAuth endpoint.</p>
          
          ${error ? `
            <div class="error">
              <h3>❌ OAuth Error</h3>
              <p><strong>Error:</strong> ${error}</p>
              <p><strong>Description:</strong> ${errorDescription || 'No description provided'}</p>
            </div>
          ` : code ? `
            <div class="success">
              <h3>✅ OAuth Success</h3>
              <p>Authorization code received successfully!</p>
            </div>
          ` : `
            <div class="info">
              <h3>ℹ️ No Code Received</h3>
              <p>No authorization code was received. This might be normal if you haven't completed the OAuth flow yet.</p>
            </div>
          `}
          
          <div class="info">
            <h3>📊 Received Parameters</h3>
            <div class="param"><strong>Code:</strong> <code>${code || 'Not provided'}</code></div>
            <div class="param"><strong>State:</strong> <code>${state || 'Not provided'}</code></div>
            <div class="param"><strong>Realm ID:</strong> <code>${realmId || 'Not provided'}</code></div>
            <div class="param"><strong>Error:</strong> <code>${error || 'None'}</code></div>
            <div class="param"><strong>Error Description:</strong> <code>${errorDescription || 'None'}</code></div>
          </div>
          
          <div class="info">
            <h3>🔗 Full Callback URL</h3>
            <code style="word-break: break-all; display: block; padding: 10px; background-color: #f8f9fa; border-radius: 4px;">${req.url}</code>
          </div>
          
          <div style="margin-top: 20px;">
            <button class="button" onclick="window.location.href='/qbo-oauth-tests'">Back to OAuth Tests</button>
            <button class="button" onclick="window.location.href='/api/qbo/test-platform-response'">Test Platform Response</button>
            <button class="button" onclick="window.location.reload()">Refresh This Page</button>
          </div>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(responseHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error: any) {
    console.error('❌ Platform callback error:', error);
    return NextResponse.json({
      error: error.message,
      details: 'Failed to handle Platform OAuth callback'
    }, { status: 500 });
  }
}
