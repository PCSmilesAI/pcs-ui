import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export async function GET() {
  const { QBO_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPES } = process.env;
  if (!QBO_CLIENT_ID || !QBO_REDIRECT_URI || !QBO_SCOPES) {
    return NextResponse.json({ error: 'Missing envs' }, { status: 500 });
  }

  const state = b64url(crypto.randomBytes(16));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

  const url = new URL('https://appcenter.intuit.com/connect/oauth2');
  url.searchParams.set('client_id', QBO_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', QBO_SCOPES);
  url.searchParams.set('redirect_uri', QBO_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  const res = NextResponse.redirect(url.toString(), { status: 302 });
  res.cookies.set('qbo_state', state, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'lax', 
    path: '/',
    domain: '.pcsmilesai.com',  // Allow both www and non-www
    maxAge: 600  // 10 minutes
  });
  res.cookies.set('qbo_verifier', verifier, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'lax', 
    path: '/',
    domain: '.pcsmilesai.com',  // Allow both www and non-www
    maxAge: 600  // 10 minutes
  });
  return res;
}
