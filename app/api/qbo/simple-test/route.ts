import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Simple OAuth URL with your new Development app keys
  const clientId = 'AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE';
  const redirectUri = 'https://pcsmilesai.com/api/qbo/callback';
  const scopes = 'com.intuit.quickbooks.accounting';
  
  // Simple state parameter
  const state = 'simple-test-' + Date.now();
  
  // Build simple OAuth URL
  const authUrl = `https://oauth.platform.intuit.com/oauth2/v1/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&state=${state}`;
  
  console.log('🔧 Simple OAuth URL:', authUrl);
  console.log('🔧 Client ID:', clientId);
  console.log('🔧 Redirect URI:', redirectUri);
  
  return NextResponse.redirect(authUrl, 302);
}



