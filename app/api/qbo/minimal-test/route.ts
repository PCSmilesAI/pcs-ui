import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET() {
  const { QBO_CLIENT_ID, QBO_SCOPES } = process.env;
  
  if (!QBO_CLIENT_ID || !QBO_SCOPES) {
    return NextResponse.json({ error: "Missing environment variables" }, { status: 500 });
  }

  // Test with minimal parameters - no PKCE, no extra params
  const redirectUri = 'https://www.pcsmilesai.com/api/qbo/callback';
  const state = 'test123';
  
  const minimalUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=${QBO_CLIENT_ID}&response_type=code&scope=${QBO_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&access_type=offline`;
  
  const alternativeUrl = `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${QBO_CLIENT_ID}&response_type=code&scope=${QBO_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&access_type=offline`;

  return NextResponse.json({
    message: "Minimal OAuth test - no PKCE, no extra parameters",
    redirect_uri: redirectUri,
    encoded_redirect_uri: encodeURIComponent(redirectUri),
    tests: [
      {
        name: "AppCenter (minimal)",
        url: minimalUrl,
        description: "AppCenter endpoint with minimal parameters"
      },
      {
        name: "Platform (minimal)", 
        url: alternativeUrl,
        description: "Platform endpoint with minimal parameters"
      }
    ],
    quickbooks_redirect_uris_to_verify: [
      'https://www.pcsmilesai.com/api/qbo/callback',
      'https://pcsmilesai.com/api/qbo/callback'
    ],
    instructions: [
      "1. Verify these exact URIs are in your QuickBooks Production Redirect URIs:",
      "   - https://www.pcsmilesai.com/api/qbo/callback",
      "   - https://pcsmilesai.com/api/qbo/callback",
      "2. Test both URLs above",
      "3. If both fail, there might be a QuickBooks app configuration issue"
    ],
    timestamp: new Date().toISOString()
  });
}