import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // Test different OAuth endpoints and formats
    const testConfigs = [
      {
        name: 'Intuit App Center (current)',
        baseUrl: 'https://appcenter.intuit.com/connect/oauth2',
        params: {
          client_id: clientId,
          scope: 'com.intuit.quickbooks.accounting',
          redirect_uri: redirectUri,
          response_type: 'code',
          state: 'test123'
        }
      },
      {
        name: 'Intuit App Center (with access_type)',
        baseUrl: 'https://appcenter.intuit.com/connect/oauth2',
        params: {
          client_id: clientId,
          scope: 'com.intuit.quickbooks.accounting',
          redirect_uri: redirectUri,
          response_type: 'code',
          access_type: 'offline',
          state: 'test123'
        }
      },
      {
        name: 'Platform OAuth (sandbox)',
        baseUrl: 'https://sandbox-quickbooks.api.intuit.com/oauth2/v1/authorize',
        params: {
          client_id: clientId,
          scope: 'com.intuit.quickbooks.accounting',
          redirect_uri: redirectUri,
          response_type: 'code',
          state: 'test123'
        }
      },
      {
        name: 'Platform OAuth (production)',
        baseUrl: 'https://oauth.platform.intuit.com/oauth2/v1/authorize',
        params: {
          client_id: clientId,
          scope: 'com.intuit.quickbooks.accounting',
          redirect_uri: redirectUri,
          response_type: 'code',
          state: 'test123'
        }
      }
    ];

    // Generate URLs for each configuration
    const testUrls = testConfigs.map(config => {
      const url = new URL(config.baseUrl);
      Object.entries(config.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      
      return {
        name: config.name,
        url: url.toString(),
        baseUrl: config.baseUrl,
        params: config.params
      };
    });

    return NextResponse.json({
      success: true,
      testUrls,
      environment: {
        clientId: clientId.substring(0, 10) + '...',
        redirectUri,
        clientIdLength: clientId.length
      },
      message: 'Test these different OAuth endpoints to see which one works'
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      details: 'Failed to generate test configurations'
    }, { status: 500 });
  }
}
