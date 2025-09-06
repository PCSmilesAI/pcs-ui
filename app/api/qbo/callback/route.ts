import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { oauth2 } from '../../../../lib/qbo/oauthClient';
import { promises as fs } from 'fs';
import path from 'path';

async function saveTokensFS(realmId: string, token: any) {
  const dir = path.join(process.cwd(), 'pcs_ai_data');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `qbo_tokens_${realmId}.json`);
  await fs.writeFile(file, JSON.stringify({
    realmId,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_in: token.expires_in,
    obtained_at: Date.now()
  }, null, 2), 'utf8');
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const realmId = url.searchParams.get('realmId');
    const state = url.searchParams.get('state');

    if (!code || !realmId) {
      return NextResponse.json({ error: 'Missing code or realmId' }, { status: 400 });
    }

    const jar = cookies();
    const savedState = jar.get('qbo_state')?.value || '';
    const verifier = jar.get('qbo_verifier')?.value || '';
    if (!state || state !== savedState) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    }

    const tokenParams: any = {
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
      scope: process.env.QBO_SCOPES!
    };
    if (verifier) tokenParams.code_verifier = verifier;

    const result = await oauth2.getToken(tokenParams);
    const token = result.token as any;

    await saveTokensFS(realmId, token);

    jar.delete('qbo_state');
    jar.delete('qbo_verifier');

    return NextResponse.redirect(new URL('/?qbo_connected=true', req.url), 302);
  } catch (err: any) {
    return NextResponse.json({ error: 'OAuth error', detail: err?.message || String(err) }, { status: 500 });
  }
}
