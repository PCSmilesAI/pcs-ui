import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { insertState } from '../../../../lib/qbo/stateStore';

// Force Node.js runtime for SQLite access
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function genPkce() {
  const code_verifier = base64url(crypto.randomBytes(32));
  const code_challenge = base64url(crypto.createHash('sha256').update(code_verifier).digest());
  return { code_verifier, code_challenge };
}

export async function GET() {
  const { QBO_CLIENT_ID, QBO_REDIRECT_URI, QBO_SCOPES } = process.env;
  if (!QBO_CLIENT_ID || !QBO_REDIRECT_URI || !QBO_SCOPES) {
    return NextResponse.json({ error: 'Missing envs' }, { status: 500 });
  }

  const state = base64url(crypto.randomBytes(24));
  const { code_verifier, code_challenge } = genPkce();
  
  // Store state in database instead of cookies
  await insertState({
    state,
    code_verifier,
    created_at: Math.floor(Date.now() / 1000)
  });

  const url = new URL('https://oauth.platform.intuit.com/oauth2/v1/authorize');
  url.searchParams.set('client_id', QBO_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', QBO_SCOPES);
  url.searchParams.set('redirect_uri', QBO_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('code_challenge', code_challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  console.log('🔐 OAuth initiated with state:', state);
  return NextResponse.redirect(url.toString(), 302);
}