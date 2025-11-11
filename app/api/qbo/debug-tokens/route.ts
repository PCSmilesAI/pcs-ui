import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';
import { getCurrentUser } from '../../../../lib/auth/currentUser';
import { isAdmin } from '../../../../lib/workflow/rolesStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // SECURITY: Require admin authentication for debug endpoint
  const user = getCurrentUser(req);
  const allowed = await isAdmin(user.email);

  if (!allowed) {
    console.warn('[API][QBO][DEBUG-TOKENS] Unauthorized access attempt', { userEmail: user.email });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

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
    // Log full error server-side only
    console.error('[QBO][DEBUG-TOKENS] failed', error);
    // Return safe error message to client
    return NextResponse.json({
      error: 'Failed to inspect tokens',
    }, { status: 500 });
  }
}
