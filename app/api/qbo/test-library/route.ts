import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    const scopes = process.env.QBO_SCOPES;
    
    if (!clientId || !clientSecret || !redirectUri || !scopes) {
      return NextResponse.json({ 
        error: 'Missing environment variables',
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        redirectUri: !!redirectUri,
        scopes: !!scopes
      }, { status: 500 });
    }

    // Test if we can make a basic request to QuickBooks
    try {
      const testUrl = 'https://sandbox-quickbooks.api.intuit.com/v3/company/1/companyinfo/1';
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PCS-AI-Test/1.0'
        }
      });

      return NextResponse.json({
        success: true,
        testUrl,
        responseStatus: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        environment: {
          clientId: clientId.substring(0, 10) + '...',
          redirectUri,
          scopes,
          hasClientSecret: !!clientSecret
        },
        message: 'QuickBooks API test completed'
      });

    } catch (fetchError: any) {
      return NextResponse.json({
        success: false,
        fetchError: fetchError.message,
        environment: {
          clientId: clientId.substring(0, 10) + '...',
          redirectUri,
          scopes,
          hasClientSecret: !!clientSecret
        }
      });
    }

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to test QuickBooks API'
    }, { status: 500 });
  }
}
