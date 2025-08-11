export async function GET() {
  try {
    return new Response(
      JSON.stringify({
        message: 'QBO API is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.QBO_ENV || 'NOT_SET',
        clientId: process.env.QBO_CLIENT_ID ? '***' + process.env.QBO_CLIENT_ID.slice(-4) : 'NOT_SET',
        redirectUri: process.env.QBO_REDIRECT_URI || 'NOT_SET',
        scopes: process.env.QBO_SCOPES || 'NOT_SET'
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
