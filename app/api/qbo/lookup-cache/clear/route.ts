import { NextRequest, NextResponse } from 'next/server';
import { clearLookupCaches } from '../../../../../lib/qbo/qboLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    clearLookupCaches();
    return NextResponse.json({ ok: true, cleared: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Internal server error' }, { status: 500 });
  }
}


