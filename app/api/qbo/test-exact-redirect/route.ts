import { NextResponse } from "next/server";
import crypto from "crypto";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function b64url(b: Buffer) {
  return b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export async function GET() {
  const { QBO_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPES } = process.env;
  
  if (!QBO_CLIENT_ID || !QBO_REDIRECT_URI || !QBO_SCOPES) {
    return NextResponse.json({ 
      error: "Missing environment variables",
      QBO_CLIENT_ID: !!QBO_CLIENT_ID,
      QBO_REDIRECT_URI: !!QBO_REDIRECT_URI,
      QBO_SCOPES: !!QBO_SCOPES
    }, { status: 500 });
  }

  const state = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

  // Test different OAuth endpoints
  const endpoints = {
    appcenter: "https://appcenter.intuit.com/connect/oauth2",
    platform: "https://oauth.platform.intuit.com/oauth2/v1/authorize",
    discovery_sandbox: "https://sandbox-quickbooks.api.intuit.com/oauth2/v1/authorize",
    discovery_production: "https://quickbooks.api.intuit.com/oauth2/v1/authorize"
  };

  const results = {};
  
  Object.entries(endpoints).forEach(([name, endpoint]) => {
    const url = new URL(endpoint);
    url.searchParams.set("client_id", QBO_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", QBO_SCOPES);
    url.searchParams.set("redirect_uri", QBO_REDIRECT_URI);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    
    // Add PKCE for some endpoints
    if (name === 'appcenter' || name === 'platform') {
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    
    results[name] = {
      endpoint,
      url: url.toString(),
      redirect_uri: QBO_REDIRECT_URI,
      redirect_uri_encoded: encodeURIComponent(QBO_REDIRECT_URI)
    };
  });

  return NextResponse.json({
    environment: {
      QBO_CLIENT_ID: QBO_CLIENT_ID.substring(0, 8) + "...",
      QBO_REDIRECT_URI,
      QBO_SCOPES,
      QBO_ENV: process.env.QBO_ENV || 'not_set'
    },
    redirect_uri_analysis: {
      original: QBO_REDIRECT_URI,
      encoded: encodeURIComponent(QBO_REDIRECT_URI),
      length: QBO_REDIRECT_URI.length,
      has_www: QBO_REDIRECT_URI.includes('www.'),
      has_trailing_slash: QBO_REDIRECT_URI.endsWith('/'),
      protocol: QBO_REDIRECT_URI.startsWith('https://') ? 'https' : 'http',
      domain: QBO_REDIRECT_URI.replace(/^https?:\/\//, '').split('/')[0],
      path: QBO_REDIRECT_URI.replace(/^https?:\/\/[^\/]+/, ''),
      char_codes: QBO_REDIRECT_URI.split('').map(c => c.charCodeAt(0))
    },
    oauth_endpoints: results,
    instructions: [
      "1. Copy the exact redirect_uri value above",
      "2. Go to https://developer.intuit.com/app/developer/myapps",
      "3. Select your app → Keys tab",
      "4. In Production Redirect URIs, add the EXACT value (no changes)",
      "5. Test the oauth_endpoints.appcenter.url (recommended)",
      "6. If that fails, try oauth_endpoints.discovery_production.url"
    ],
    timestamp: new Date().toISOString()
  });
}
