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

function genPkce() {
  const code_verifier = base64url(crypto.randomBytes(32));
  const code_challenge = base64url(crypto.createHash('sha256').update(code_verifier).digest());
  return { code_verifier, code_challenge };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const debug = url.searchParams.get('debug') === '1' || url.searchParams.get('debug') === 'true';
  const {
    QBO_CLIENT_ID,
    QBO_REDIRECT_URI,
    QBO_SCOPES = 'com.intuit.quickbooks.accounting',
    QBO_STATE_SECRET,
    QBO_ENVIRONMENT = 'production'
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

  const { code_verifier, code_challenge } = genPkce();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now,
    exp: now + 10 * 60, // 10 minutes
    nonce: base64url(crypto.randomBytes(16)),
    code_verifier,
    redirect_uri: QBO_REDIRECT_URI,
  };

  const state = signState(payload, QBO_STATE_SECRET as string);

  console.log('[QBO][AUTH] redirecting to Intuit', { redirect_uri: QBO_REDIRECT_URI, scopes: QBO_SCOPES, has_state_secret: !!QBO_STATE_SECRET, environment: QBO_ENVIRONMENT });

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
  authUrl.searchParams.set('code_challenge', code_challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('[QBO][AUTH] FULL OAuth URL:', authUrl.toString());
  console.log('[QBO][AUTH] Client ID being used:', QBO_CLIENT_ID);

  return NextResponse.redirect(authUrl.toString(), 302);
}