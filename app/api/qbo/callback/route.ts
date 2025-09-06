import { NextRequest, NextResponse } from 'next/server';
import { oauth2 } from '@/lib/qbo/oauthClient';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');

  if (!code || !realmId) {
    return NextResponse.json({ error: 'Missing code or realmId' }, { status: 400 });
  }

  try {
    const { token } = await oauth2.getToken({
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    });

    // In production, securely store token & realmId in your database.
    return NextResponse.json({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in,
      realmId,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'OAuth error' }, { status: 500 });
  }
}
