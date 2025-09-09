import { NextRequest, NextResponse } from 'next/server';
import { getStateAndDelete } from '../../../../lib/qbo/stateStore';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

// Force Node.js runtime for SQLite access
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  const state = url.searchParams.get('state');
  
  console.log('🔄 Callback received:', { code: !!code, realmId, state });
  
  if (!code || !realmId || !state) {
    return NextResponse.json({ 
      error: 'Missing required parameters',
      received: { code: !!code, realmId, state }
    }, { status: 400 });
  }

  // Validate state from database
  const stateData = await getStateAndDelete(state);
  if (!stateData) {
    console.log('❌ Invalid or expired state:', state);
    return NextResponse.json({ 
      error: 'Invalid or expired state'
    }, { status: 400 });
  }

  try {
    // Exchange code for tokens with PKCE
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    
    const clientId = process.env.QBO_CLIENT_ID || '';
    const clientSecret = process.env.QBO_CLIENT_SECRET || '';
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.QBO_REDIRECT_URI || 'https://www.pcsmilesai.com/api/qbo/callback',
      code_verifier: stateData.code_verifier
    });

    console.log('🔄 Exchanging code for tokens...');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: tokenData.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      return NextResponse.json({ 
        error: 'Token exchange failed', 
        detail: errorText
      }, { status: 500 });
    }

    const token = await tokenResponse.json();
    console.log('✅ Tokens received:', { 
      has_access_token: !!token.access_token,
      has_refresh_token: !!token.refresh_token,
      expires_in: token.expires_in
    });

    // Save tokens to database
    await tokenStorage.saveTokens({
      realmId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
    });
    
    console.log('🎉 Successfully connected to QuickBooks!');
    console.log('📊 Realm ID:', realmId);

    // Redirect back to the app
    const baseUrl = process.env.QBO_REDIRECT_URI?.replace('/api/qbo/callback', '') || 'https://www.pcsmilesai.com';
    return NextResponse.redirect(`${baseUrl}/?qbo_connected=true`, 302);
    
  } catch (e: any) {
    console.error('❌ OAuth error:', e);
    return NextResponse.json({ 
      error: 'OAuth error', 
      detail: e?.message || String(e),
      stack: e?.stack
    }, { status: 500 });
  }
}