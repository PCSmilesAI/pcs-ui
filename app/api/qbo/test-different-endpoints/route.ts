import { NextResponse } from "next/server";
import crypto from "crypto";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function b64url(b: Buffer) {
  return b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export async function GET() {
  const { QBO_CLIENT_ID, QBO_SCOPES } = process.env;
  
  if (!QBO_CLIENT_ID || !QBO_SCOPES) {
    return NextResponse.json({ error: "Missing environment variables" }, { status: 500 });
  }

  const state = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

  // Test different redirect URIs and endpoints
  const redirectUris = [
    'https://www.pcsmilesai.com/api/qbo/callback',
    'https://pcsmilesai.com/api/qbo/callback',
    'https://www.pcsmilesai.com/api/qbo/callback/',
    'https://pcsmilesai.com/api/qbo/callback/',
    'https://www.pcsmilesai.com/qbo-callback',
    'https://pcsmilesai.com/qbo-callback'
  ];

  const endpoints = [
    'https://appcenter.intuit.com/connect/oauth2',
    'https://oauth.platform.intuit.com/oauth2/v1/authorize',
    'https://quickbooks.api.intuit.com/oauth2/v1/authorize',
    'https://sandbox-quickbooks.api.intuit.com/oauth2/v1/authorize'
  ];

  const tests: Array<{
    redirect_uri: string;
    endpoint: string;
    url: string;
    encoded_redirect_uri: string;
  }> = [];

  redirectUris.forEach(redirectUri => {
    endpoints.forEach(endpoint => {
      const url = new URL(endpoint);
      url.searchParams.set("client_id", QBO_CLIENT_ID);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", QBO_SCOPES);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("access_type", "offline");
      
      // Add PKCE for some endpoints
      if (endpoint.includes('appcenter') || endpoint.includes('platform')) {
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");
      }
      
      tests.push({
        redirect_uri: redirectUri,
        endpoint: endpoint,
        url: url.toString(),
        encoded_redirect_uri: encodeURIComponent(redirectUri)
      });
    });
  });

  return NextResponse.json({
    message: "Test different redirect URIs and endpoints",
    total_tests: tests.length,
    tests: tests,
    instructions: [
      "1. Test each URL below in your browser",
      "2. Look for QuickBooks login page (success) vs redirect URI error",
      "3. Report which combinations work",
      "4. This will help identify the exact mismatch"
    ],
    timestamp: new Date().toISOString()
  });
}