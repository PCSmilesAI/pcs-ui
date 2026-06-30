import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

async function refreshTokensIfNeeded() {
  try {
    const { qboClient } = await import('../../../../lib/qbo/qboClient');
    await qboClient.initialize();
    await qboClient.ensureValidToken();
    return { refreshed: true, error: null };
  } catch (error: any) {
    console.warn('[QBO][status] token refresh attempt failed:', error?.message || error);
    return { refreshed: false, error };
  }
}

// Force Node.js runtime for SQLite access
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 QBO Status API called');
    
    // Get latest tokens and check if they're valid
    let tokens = await tokenStorage.getLatestTokens();
    const now = Math.floor(Date.now() / 1000);
    let isExpired = tokens ? (tokens.expiresAt ?? 0) <= now : true;
    let refreshed = false;
    let refreshError: string | null = null;

    if (tokens && isExpired) {
      const result = await refreshTokensIfNeeded();
      refreshed = result.refreshed;
      if (result.error) {
        // Log full error server-side only
        console.error('[QBO][STATUS] Token refresh error:', result.error?.message);
        // Return safe error message to client
        refreshError = 'Token refresh failed';
      }
      if (result.refreshed) {
        tokens = await tokenStorage.getLatestTokens();
        isExpired = tokens ? (tokens.expiresAt ?? 0) <= now : true;
      }
    }

    const isConnected = !!tokens?.accessToken && !!tokens?.realmId && !isExpired;

    const qboEnvironment = process.env.QBO_ENVIRONMENT || 'sandbox';

    return NextResponse.json({
      connected: isConnected,
      message: isConnected 
        ? `Connected to QuickBooks (${tokens?.realmId ?? 'unknown'})` 
        : 'Not connected to QuickBooks',
      environment: qboEnvironment,
      realmId: tokens?.realmId ?? null,
      tokens: tokens ? [{
        realmId: tokens.realmId,
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        expiresAt: tokens.expiresAt
      }] : [],
      debug: {
        timestamp: new Date().toISOString(),
        hasTokens: !!tokens,
        isExpired,
        attemptedRefresh: refreshed,
        refreshError,
      }
    });

  } catch (error: any) {
    // Log full error server-side only
    console.error('Status check error:', error);
    // Return safe error message to client
    return NextResponse.json({
      connected: false,
      error: 'Status check failed',
      tokens: null,
      debug: {
        timestamp: new Date().toISOString(),
      }
    }, { status: 500 });
  }
}
