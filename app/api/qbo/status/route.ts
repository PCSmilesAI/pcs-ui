import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

// Force Node.js runtime for SQLite access
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 QBO Status API called');
    
    // Get latest tokens and check if they're valid
    const tokens = await tokenStorage.getLatestTokens();
    const now = Math.floor(Date.now() / 1000);
    const isConnected = !!tokens?.accessToken && !!tokens?.realmId && (tokens.expiresAt ?? 0) > now;
    
    return NextResponse.json({
      connected: isConnected,
      message: isConnected 
        ? `Connected to QuickBooks (${tokens.realmId})` 
        : 'Not connected to QuickBooks',
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
        isExpired: tokens ? (tokens.expiresAt ?? 0) <= now : true
      }
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json({
      connected: false,
      error: error.message || 'Failed to check QuickBooks status',
      tokens: null,
      debug: {
        timestamp: new Date().toISOString(),
        error: error.toString()
      }
    }, { status: 500 });
  }
}
