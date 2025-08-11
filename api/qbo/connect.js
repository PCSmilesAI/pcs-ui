export async function GET() {
  try {
    console.log('🚀 QBO Connect route called');
    
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    const qboEnv = process.env.QBO_ENV || 'sandbox';
    
    console.log('📋 Environment variables:');
    console.log('  QBO_ENV:', qboEnv);
    console.log('  QBO_CLIENT_ID:', clientId ? '***' + clientId.slice(-4) : 'MISSING');
    console.log('  QBO_REDIRECT_URI:', redirectUri || 'MISSING');
    console.log('  QBO_SCOPES:', scopes || 'MISSING');
    
    if (!clientId || !redirectUri || !scopes) {
      console.error('❌ Missing required environment variables for QBO OAuth');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required environment variables',
          missing: {
            clientId: !clientId,
            redirectUri: !redirectUri,
            scopes: !scopes
          }
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine the base URL based on environment
    const baseUrl = qboEnv === 'sandbox' 
      ? 'https://sandbox-accounts.platform.intuit.com'
      : 'https://accounts.platform.intuit.com';

    // Build the OAuth authorization URL
    const authUrl = new URL('/oauth2/v1/authorizations/request', baseUrl);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', 'qbo_oauth_' + Date.now()); // Simple state for CSRF protection

    console.log('🔗 Built OAuth URL:', authUrl.toString());
    
    // Redirect the user to QuickBooks for authorization
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl.toString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error in QBO connect route:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to initiate OAuth flow',
        details: error.message,
        stack: error.stack
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
