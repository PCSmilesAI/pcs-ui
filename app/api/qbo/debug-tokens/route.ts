import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const latest = await tokenStorage.getLatestTokens();
    const all = await tokenStorage.getAllTokens();

    return NextResponse.json({
      latest: latest ? {
        realmId: latest.realmId,
        hasAccessToken: !!latest.accessToken,
        hasRefreshToken: !!latest.refreshToken,
        expiresAt: latest.expiresAt,
        expiresIn: latest.expiresIn,
      } : null,
      count: all.length,
      realms: all.map((token) => ({
        realmId: token.realmId,
        hasAccessToken: !!token.accessToken,
        hasRefreshToken: !!token.refreshToken,
        expiresAt: token.expiresAt,
        expiresIn: token.expiresIn,
      })),
    });
  } catch (error: any) {
    console.error('[QBO][DEBUG-TOKENS] failed', error);
    return NextResponse.json({
      error: error?.message || 'Failed to inspect tokens',
    }, { status: 500 });
  }
}
