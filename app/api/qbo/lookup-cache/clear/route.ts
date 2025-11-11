import { NextRequest, NextResponse } from 'next/server';
import { clearLookupCaches } from '../../../../../lib/qbo/qboLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    clearLookupCaches();
    return NextResponse.json({ ok: true, cleared: true });
  } catch (error: any) {
    // Log full error server-side only
    console.error('[QBO][LOOKUP_CACHE][CLEAR]', 'error', { error: error?.message });
    // Return safe error message to client
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}


