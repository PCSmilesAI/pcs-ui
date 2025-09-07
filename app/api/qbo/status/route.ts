import { NextRequest, NextResponse } from 'next/server';
import { tokenStorage } from '../../../../lib/qbo/tokenStorage';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('🔄 QBO Status API called');
    
    // Get all stored tokens
    const tokens = await tokenStorage.getAllTokens();
    
    return NextResponse.json({
      connected: tokens.length > 0,
      message: tokens.length > 0 
        ? `Connected to ${tokens.length} QuickBooks company(ies)` 
        : 'Not connected to QuickBooks',
      tokens: tokens.map(t => ({
        realmId: t.realmId,
        hasAccessToken: !!t.accessToken,
        hasRefreshToken: !!t.refreshToken,
        expiresIn: t.expiresIn
      })),
      debug: {
        timestamp: new Date().toISOString(),
        tokenCount: tokens.length
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
