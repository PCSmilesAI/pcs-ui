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

export async function GET() {
  const { QBO_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPES, QBO_STATE_SECRET } = process.env;
  if (!QBO_CLIENT_ID || !QBO_REDIRECT_URI || !QBO_SCOPES || !QBO_STATE_SECRET) {
    return NextResponse.json({ error: 'Missing required environment variables' }, { status: 500 });
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

  const state = signState(payload, QBO_STATE_SECRET);

  console.log('[QBO][AUTH] redirecting to Intuit', {
    redirect_uri: QBO_REDIRECT_URI,
    state_len: state.length
  });

  // Intuit login endpoint – use AppCenter for interactive auth
  const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
  authUrl.searchParams.set('client_id', QBO_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', QBO_SCOPES);
  authUrl.searchParams.set('redirect_uri', QBO_REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('code_challenge', code_challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(authUrl.toString(), 302);
}