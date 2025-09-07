import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET() {
  const redirectUri = process.env.QBO_REDIRECT_URI || '';
  
  return NextResponse.json({
    current_redirect_uri: redirectUri,
    redirect_uri_encoded: encodeURIComponent(redirectUri),
    quickbooks_redirect_uris_to_add: [
      'https://www.pcsmilesai.com/api/qbo/callback',
      'https://pcsmilesai.com/api/qbo/callback'
    ],
    instructions: [
      '1. Go to https://developer.intuit.com/app/developer/myapps',
      '2. Select your app → Keys tab',
      '3. In Production Redirect URIs, add BOTH of these:',
      '   - https://www.pcsmilesai.com/api/qbo/callback',
      '   - https://pcsmilesai.com/api/qbo/callback',
      '4. Make sure they are in the PRODUCTION list (not Development)',
      '5. Test the OAuth URL below'
    ],
    test_oauth_url: `https://appcenter.intuit.com/connect/oauth2?client_id=${process.env.QBO_CLIENT_ID}&response_type=code&scope=${process.env.QBO_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=test123&access_type=offline`,
    timestamp: new Date().toISOString()
  });
}
