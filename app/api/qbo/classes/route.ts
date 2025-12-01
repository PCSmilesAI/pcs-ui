import { NextRequest, NextResponse } from 'next/server';
import { QBOClient } from '@/lib/qbo/qboClient';
import { getLatestTokens, ensureAccessToken } from '@/lib/qbo/tokenStorage';

export async function GET(req: NextRequest) {
  try {
    const tokens = await getLatestTokens();
    if (!tokens?.realm_id) {
      return NextResponse.json(
        { error: 'not_connected', detail: 'No realm_id/tokens found.' },
        { status: 401 }
      );
    }

    const valid = await ensureAccessToken(tokens);
    const qboClient = new QBOClient();
    await qboClient.initialize();
    qboClient.setTokens(valid);

    const classes = await qboClient.getClasses();

    return NextResponse.json({
      success: true,
      classes: classes.map(c => ({
        id: c.id,
        name: c.name,
        fullName: c.fullName,
      })),
    });
  } catch (error: any) {
    console.error('[API][QBO][CLASSES] Error:', error);
    return NextResponse.json(
      { error: 'failed_to_fetch', detail: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

