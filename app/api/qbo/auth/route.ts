import { NextResponse } from 'next/server';
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

function signState(payload: any, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const toSign = `${h}.${p}`;
  const sig = b64url(hmac(toSign, secret));
  return `${toSign}.${sig}`;
}

function base64url(b: Buffer) {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const debug = url.searchParams.get('debug') === '1' || url.searchParams.get('debug') === 'true';
  const {
    QBO_CLIENT_ID,
    QBO_REDIRECT_URI,
    QBO_SCOPES = 'com.intuit.quickbooks.accounting',
    QBO_STATE_SECRET,
    QBO_ENVIRONMENT = 'sandbox'
  } = process.env as Record<string, string | undefined>;

  const missing: string[] = [];
  if (!QBO_CLIENT_ID) missing.push('QBO_CLIENT_ID');
  if (!QBO_REDIRECT_URI) missing.push('QBO_REDIRECT_URI');
  if (!QBO_STATE_SECRET) missing.push('QBO_STATE_SECRET');
  if (!QBO_SCOPES) missing.push('QBO_SCOPES');

  if (debug) {
    return NextResponse.json({
      ok: missing.length === 0,
      missing,
      present: {
        QBO_CLIENT_ID: !!QBO_CLIENT_ID,
        QBO_REDIRECT_URI: !!QBO_REDIRECT_URI,
        QBO_SCOPES: !!QBO_SCOPES,
        QBO_STATE_SECRET: !!QBO_STATE_SECRET,
      }
    });
  }

  if (missing.length) {
    // Log full error server-side only
    console.error('[QBO][AUTH] Missing env', missing);
    // Return safe error message to client
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now,
    exp: now + 10 * 60, // 10 minutes
    nonce: base64url(crypto.randomBytes(16)),
    redirect_uri: QBO_REDIRECT_URI,
  };

  const state = signState(payload, QBO_STATE_SECRET as string);

  // Use correct OAuth endpoint based on environment
  const oauthEndpoint = QBO_ENVIRONMENT === 'sandbox' 
    ? 'https://appcenter.intuit.com/connect/oauth2'
    : 'https://appcenter.intuit.com/connect/oauth2';
  
  const authUrl = new URL(oauthEndpoint);
  authUrl.searchParams.set('client_id', QBO_CLIENT_ID as string);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', QBO_SCOPES as string);
  authUrl.searchParams.set('redirect_uri', QBO_REDIRECT_URI as string);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');

  // Extract and decode redirect_uri for verification
  const encodedRedirectUri = authUrl.searchParams.get('redirect_uri') || '';
  const decodedRedirectUri = decodeURIComponent(encodedRedirectUri);

  // Comprehensive logging for debugging
  console.log('═══════════════════════════════════════════════════════════');
  console.log('[QBO][AUTH] OAuth Configuration Debug Info:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Environment:', QBO_ENVIRONMENT);
  console.log('Client ID:', QBO_CLIENT_ID);
  console.log('Client ID Length:', QBO_CLIENT_ID?.length);
  console.log('Redirect URI (raw from env):', QBO_REDIRECT_URI);
  console.log('Redirect URI (encoded in URL):', encodedRedirectUri);
  console.log('Redirect URI (decoded):', decodedRedirectUri);
  console.log('Redirect URI Length:', decodedRedirectUri.length);
  console.log('Redirect URI Characters:', JSON.stringify(decodedRedirectUri.split('')));
  console.log('Has trailing slash:', decodedRedirectUri.endsWith('/'));
  console.log('Protocol:', decodedRedirectUri.startsWith('https://') ? 'HTTPS' : decodedRedirectUri.startsWith('http://') ? 'HTTP' : 'UNKNOWN');
  console.log('Scopes:', QBO_SCOPES);
  console.log('OAuth Endpoint:', oauthEndpoint);
  console.log('Full Auth URL:', authUrl.toString());
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('⚠️  VERIFICATION CHECKLIST:');
  console.log('1. Copy the "Redirect URI (decoded)" value above');
  console.log('2. Go to Intuit Developer Portal → Your App → Keys & OAuth → DEVELOPMENT tab');
  console.log('3. Compare character-by-character with registered redirect URI');
  console.log('4. Ensure Client ID matches Development Client ID (not Production)');
  console.log('5. Check for: trailing slashes, http vs https, port numbers, exact path');
  console.log('═══════════════════════════════════════════════════════════');

  // Use 302 redirect with no-cache headers to prevent browser caching issues
  const response = NextResponse.redirect(authUrl.toString(), 302);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}