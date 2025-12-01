import { NextRequest, NextResponse } from 'next/server';
import { QBOClient } from '@/lib/qbo/qboClient';
import { tokenStorage } from '@/lib/qbo/tokenStorage';

export async function GET(req: NextRequest) {
  try {
    const tokens = await tokenStorage.getLatestTokens();
    if (!tokens?.realmId) {
      return NextResponse.json(
        { error: 'not_connected', detail: 'No realmId/tokens found.' },
        { status: 401 }
      );
    }

    const qboClient = new QBOClient();
    await qboClient.initialize();
    qboClient.setTokens(tokens);

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

