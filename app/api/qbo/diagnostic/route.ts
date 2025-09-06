import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test basic connectivity to QuickBooks
    const connectivityTests = [
      {
        name: 'QuickBooks API Health Check',
        url: 'https://sandbox-quickbooks.api.intuit.com/v3/company/1/companyinfo/1',
        method: 'GET'
      },
      {
        name: 'Production API Health Check',
        url: 'https://quickbooks.api.intuit.com/v3/company/1/companyinfo/1',
        method: 'GET'
      },
      {
        name: 'OAuth Discovery (sandbox)',
        url: 'https://sandbox-quickbooks.api.intuit.com/.well-known/openid_configuration',
        method: 'GET'
      },
      {
        name: 'OAuth Discovery (production)',
        url: 'https://oauth.platform.intuit.com/.well-known/openid_configuration',
        method: 'GET'
      }
    ];

    const results = [];
    
    for (const test of connectivityTests) {
      try {
        const response = await fetch(test.url, {
          method: test.method,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'PCS-AI-Test/1.0'
          }
        });
        
        results.push({
          name: test.name,
          url: test.url,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          success: response.ok
        });
      } catch (error: any) {
        results.push({
          name: test.name,
          url: test.url,
          error: error.message,
          success: false
        });
      }
    }

    return NextResponse.json({
      success: true,
      connectivityTests: results,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        clientIdLength: clientId.length
      },
      message: 'These tests will help identify if there are connectivity issues with QuickBooks'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to run diagnostic tests'
    }, { status: 500 });
  }
}
