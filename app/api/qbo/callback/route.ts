import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';
import crypto from 'crypto';

// Force Node.js runtime for SQLite access
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// JWT state helpers
const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function hmac(data: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

function verifyState(token: string, secret: string): any | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(hmac(`${h}.${p}`, secret));
  if (s !== expected) return null;
  const payload = JSON.parse(unb64url(p).toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  return payload;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  
  const { QBO_STATE_SECRET, QBO_REDIRECT_URI, QBO_CLIENT_ID, QBO_CLIENT_SECRET } = process.env;
  
  // Log the actual callback URL received
  const actualCallbackUrl = url.toString();
  const callbackPath = url.pathname + url.search;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('[QBO][CALLBACK] Incoming Request Debug Info:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Full Callback URL:', actualCallbackUrl);
  console.log('Callback Path + Query:', callbackPath);
  console.log('Expected Redirect URI:', QBO_REDIRECT_URI);
  console.log('Got Code:', !!code, code ? `(${code.substring(0, 20)}...)` : 'NO');
  console.log('Got State:', !!state, state ? `(${state.substring(0, 30)}...)` : 'NO');
  console.log('State Length:', state?.length);
  console.log('Realm ID:', realmId);
  console.log('Environment:', process.env.QBO_ENVIRONMENT);
  console.log('═══════════════════════════════════════════════════════════');

  if (!code || !state) {
    return NextResponse.json({ 
      error: 'Missing required parameters',
      received: { code: !!code, state: !!state, realmId }
    }, { status: 400 });
  }
  if (!QBO_STATE_SECRET || !QBO_REDIRECT_URI || !QBO_CLIENT_ID || !QBO_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  // Verify JWT state
  const payload = verifyState(state, QBO_STATE_SECRET);
  if (!payload) {
    console.log('❌ Invalid or expired JWT state');
    return NextResponse.json({ 
      error: 'Invalid state'
    }, { status: 400 });
  }

  // Optional: enforce the same redirect URI we used when creating state
  if (payload.redirect_uri !== QBO_REDIRECT_URI) {
    console.log('❌ Redirect URI mismatch:', payload.redirect_uri, 'vs', QBO_REDIRECT_URI);
    return NextResponse.json({ 
      error: 'Redirect URI mismatch' 
    }, { status: 400 });
  }

  try {
    // Exchange code for tokens - use correct endpoint based on environment
    const { QBO_ENVIRONMENT = 'sandbox' } = process.env;
    const tokenUrl = QBO_ENVIRONMENT === 'sandbox'
      ? 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    
    const authString = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString('base64');
    
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: QBO_REDIRECT_URI
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
      // Log full error server-side only
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      // Return safe error message to client
      return NextResponse.json({
        error: 'Token exchange failed'
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
      realmId: realmId || 'unknown',
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
    });
    
    console.log('🎉 Successfully connected to QuickBooks!');
    console.log('📊 Realm ID:', realmId);

    // Redirect back to the Connections page with cache-busting
    const baseUrl = QBO_REDIRECT_URI.replace('/api/qbo/callback', '');
    const timestamp = Date.now();
    const redirectUrl = `${baseUrl}/ConnectionsPage?qbo_connected=true&t=${timestamp}`;
    
    // Use 303 redirect and add no-cache headers to prevent browser caching issues
    const response = NextResponse.redirect(redirectUrl, 303);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
    
  } catch (e: any) {
    // Log full error server-side only
    console.error('❌ OAuth error:', e);
    // Return safe error message to client
    return NextResponse.json({
      error: 'OAuth error'
    }, { status: 500 });
  }
}